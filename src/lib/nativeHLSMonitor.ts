/**
 * Native HLS Monitor
 * 
 * Monitors HLS playback on iOS Safari (and other native HLS players) by:
 * 1. Intercepting network requests via PerformanceObserver
 * 2. Reading webkit-prefixed audio decode metrics
 * 3. Tracking buffer health and stall events
 * 4. Using Navigator.connection for network context
 * 
 * This provides ABR visibility that native HLS doesn't expose directly.
 */

import type {
  NativeHLSMetrics,
  NativeHLSMonitorConfig,
  QualityTier,
  SegmentRequest,
  TierSwitch,
  StallEvent,
  ConnectionInfo,
} from './types/nativeHLSMetrics';
import { DEFAULT_MONITOR_CONFIG, TIER_BANDWIDTHS } from './types/nativeHLSMetrics';

// Extend HTMLAudioElement for webkit properties
interface WebkitAudioElement extends HTMLAudioElement {
  webkitAudioDecodedByteCount?: number;
}

// Extend Navigator for connection API
interface NavigatorWithConnection extends Navigator {
  connection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
  };
}

/**
 * Extract quality tier from HLS segment URL
 * Looks for /low/, /medium/, /high/, /premium/ in the path
 */
export function extractTierFromUrl(url: string): QualityTier {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('/low/')) return 'low';
  if (lowerUrl.includes('/medium/')) return 'medium';
  if (lowerUrl.includes('/high/')) return 'high';
  if (lowerUrl.includes('/premium/')) return 'premium';
  
  return 'unknown';
}

/**
 * Format bandwidth for display
 */
export function formatBandwidth(bps: number): string {
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  } else if (bps >= 1_000) {
    return `${(bps / 1_000).toFixed(0)} kbps`;
  }
  return `${bps} bps`;
}

/**
 * Determine if a URL is an HLS segment or playlist
 */
export function isHLSResource(url: string): boolean {
  return url.includes('.ts') || url.includes('.m3u8');
}

/**
 * Compare two tiers and determine direction
 */
export function compareTiers(from: QualityTier, to: QualityTier): 'upgrade' | 'downgrade' | 'same' {
  if (from === to) return 'same';
  if (from === 'unknown' || to === 'unknown') return 'same';
  
  const tierOrder: QualityTier[] = ['low', 'medium', 'high', 'premium'];
  const fromIndex = tierOrder.indexOf(from);
  const toIndex = tierOrder.indexOf(to);
  
  return toIndex > fromIndex ? 'upgrade' : 'downgrade';
}

/**
 * Native HLS Monitor Class
 */
export class NativeHLSMonitor {
  private config: NativeHLSMonitorConfig;
  private audioElement: WebkitAudioElement | null = null;
  private performanceObserver: PerformanceObserver | null = null;
  
  // State
  private currentTier: QualityTier = 'unknown';
  private segmentHistory: SegmentRequest[] = [];
  private tierSwitchHistory: TierSwitch[] = [];
  private stallEvents: StallEvent[] = [];
  private currentStall: StallEvent | null = null;
  
  // Metrics
  private lastDecodedBytes = 0;
  private lastDecodedBytesTime = 0;
  private decodedBytesPerSecond = 0;
  private rollingBandwidthSamples: number[] = [];
  
  // Timestamps
  private monitoringStartTime = 0;
  private isMonitoring = false;
  
  // Event listeners
  private boundHandleWaiting: () => void;
  private boundHandlePlaying: () => void;
  private boundHandleTimeUpdate: () => void;
  
  constructor(config: Partial<NativeHLSMonitorConfig> = {}) {
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
    
    // Bind event handlers
    this.boundHandleWaiting = this.handleWaiting.bind(this);
    this.boundHandlePlaying = this.handlePlaying.bind(this);
    this.boundHandleTimeUpdate = this.handleTimeUpdate.bind(this);
  }
  
  /**
   * Start monitoring an audio element
   */
  start(audioElement: HTMLAudioElement): void {
    if (this.isMonitoring) {
      this.stop();
    }
    
    this.audioElement = audioElement as WebkitAudioElement;
    this.monitoringStartTime = Date.now();
    this.isMonitoring = true;
    
    // Reset state
    this.currentTier = 'unknown';
    this.segmentHistory = [];
    this.tierSwitchHistory = [];
    this.stallEvents = [];
    this.currentStall = null;
    this.lastDecodedBytes = 0;
    this.lastDecodedBytesTime = Date.now();
    this.decodedBytesPerSecond = 0;
    this.rollingBandwidthSamples = [];
    
    // Set up PerformanceObserver for network requests
    this.setupPerformanceObserver();
    
    // Set up audio element event listeners
    this.audioElement.addEventListener('waiting', this.boundHandleWaiting);
    this.audioElement.addEventListener('playing', this.boundHandlePlaying);
    this.audioElement.addEventListener('timeupdate', this.boundHandleTimeUpdate);
    
    if (this.config.debug) {
      console.log('[NativeHLSMonitor] Started monitoring');
    }
  }
  
  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
    
    if (this.audioElement) {
      this.audioElement.removeEventListener('waiting', this.boundHandleWaiting);
      this.audioElement.removeEventListener('playing', this.boundHandlePlaying);
      this.audioElement.removeEventListener('timeupdate', this.boundHandleTimeUpdate);
      this.audioElement = null;
    }
    
    this.isMonitoring = false;
    
    if (this.config.debug) {
      console.log('[NativeHLSMonitor] Stopped monitoring');
    }
  }
  
  /**
   * Get current metrics snapshot
   */
  getMetrics(): NativeHLSMetrics {
    const now = Date.now();
    const lastSegment = this.segmentHistory[this.segmentHistory.length - 1] || null;
    const averageBandwidth = this.calculateAverageBandwidth();
    
    return {
      // Current state
      currentTier: this.currentTier,
      lastSegmentUrl: lastSegment?.url || null,
      lastSegmentDownloadTime: lastSegment?.downloadTime || null,
      estimatedBandwidth: averageBandwidth,
      bandwidthDisplay: formatBandwidth(averageBandwidth),
      
      // Playback health
      bufferLength: this.getBufferLength(),
      stallCount: this.stallEvents.length,
      lastStall: this.stallEvents[this.stallEvents.length - 1] || null,
      isStalled: this.currentStall !== null,
      
      // Decoded data
      audioDecodedBytes: this.audioElement?.webkitAudioDecodedByteCount || 0,
      decodedBytesPerSecond: this.decodedBytesPerSecond,
      inferredPlaybackBitrate: this.decodedBytesPerSecond * 8,
      
      // Network context
      connection: this.getConnectionInfo(),
      
      // History
      segmentHistory: [...this.segmentHistory],
      tierSwitchHistory: [...this.tierSwitchHistory],
      
      // Monitoring state
      monitoringStartTime: this.monitoringStartTime,
      monitoringDuration: now - this.monitoringStartTime,
      isMonitoring: this.isMonitoring,
    };
  }
  
  /**
   * Set up PerformanceObserver to track resource loading
   */
  private setupPerformanceObserver(): void {
    if (typeof PerformanceObserver === 'undefined') {
      if (this.config.debug) {
        console.warn('[NativeHLSMonitor] PerformanceObserver not available');
      }
      return;
    }
    
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.processResourceEntry(entry as PerformanceResourceTiming);
        }
      });
      
      this.performanceObserver.observe({ entryTypes: ['resource'] });
    } catch (error) {
      if (this.config.debug) {
        console.error('[NativeHLSMonitor] Failed to set up PerformanceObserver:', error);
      }
    }
  }
  
  /**
   * Process a resource timing entry
   */
  private processResourceEntry(entry: PerformanceResourceTiming): void {
    const url = entry.name;
    
    // Only process HLS resources
    if (!isHLSResource(url)) return;
    
    // Skip m3u8 playlist files, focus on .ts segments
    if (url.includes('.m3u8')) return;
    
    const tier = extractTierFromUrl(url);
    const downloadTime = entry.duration;
    const transferSize = entry.transferSize || 0;
    
    // Calculate bandwidth from this segment
    const estimatedBandwidth = transferSize > 0 && downloadTime > 0
      ? (transferSize * 8) / (downloadTime / 1000)
      : 0;
    
    const segmentRequest: SegmentRequest = {
      url,
      tier,
      startTime: entry.startTime + this.monitoringStartTime,
      downloadTime,
      transferSize,
      estimatedBandwidth,
    };
    
    // Add to history
    this.segmentHistory.push(segmentRequest);
    if (this.segmentHistory.length > this.config.maxSegmentHistory) {
      this.segmentHistory.shift();
    }
    
    // Track bandwidth sample
    if (estimatedBandwidth > 0) {
      this.rollingBandwidthSamples.push(estimatedBandwidth);
      if (this.rollingBandwidthSamples.length > 10) {
        this.rollingBandwidthSamples.shift();
      }
    }
    
    // Check for tier switch
    if (tier !== 'unknown' && tier !== this.currentTier) {
      const direction = compareTiers(this.currentTier, tier);
      
      if (this.currentTier !== 'unknown') {
        const tierSwitch: TierSwitch = {
          fromTier: this.currentTier,
          toTier: tier,
          timestamp: Date.now(),
          direction,
        };
        
        this.tierSwitchHistory.push(tierSwitch);
        if (this.tierSwitchHistory.length > this.config.maxTierSwitchHistory) {
          this.tierSwitchHistory.shift();
        }
        
        if (this.config.debug) {
          console.log(`[NativeHLSMonitor] Tier switch: ${this.currentTier} → ${tier} (${direction})`);
        }
      }
      
      this.currentTier = tier;
    }
    
    if (this.config.debug) {
      console.log(`[NativeHLSMonitor] Segment: ${tier} | ${downloadTime.toFixed(0)}ms | ${formatBandwidth(estimatedBandwidth)}`);
    }
  }
  
  /**
   * Handle waiting event (playback stalled)
   */
  private handleWaiting(): void {
    if (this.currentStall) return; // Already tracking a stall
    
    this.currentStall = {
      timestamp: Date.now(),
      duration: null,
      bufferLength: this.getBufferLength(),
    };
    
    if (this.config.debug) {
      console.log('[NativeHLSMonitor] Playback stalled');
    }
  }
  
  /**
   * Handle playing event (playback resumed)
   */
  private handlePlaying(): void {
    if (!this.currentStall) return;
    
    this.currentStall.duration = Date.now() - this.currentStall.timestamp;
    this.stallEvents.push(this.currentStall);
    
    if (this.config.debug) {
      console.log(`[NativeHLSMonitor] Playback resumed after ${this.currentStall.duration}ms stall`);
    }
    
    this.currentStall = null;
  }
  
  /**
   * Handle timeupdate event (track decoded bytes)
   */
  private handleTimeUpdate(): void {
    if (!this.audioElement) return;
    
    const currentDecodedBytes = this.audioElement.webkitAudioDecodedByteCount || 0;
    const now = Date.now();
    const timeDelta = (now - this.lastDecodedBytesTime) / 1000; // seconds
    
    if (timeDelta > 0 && this.lastDecodedBytes > 0) {
      const bytesDelta = currentDecodedBytes - this.lastDecodedBytes;
      this.decodedBytesPerSecond = bytesDelta / timeDelta;
    }
    
    this.lastDecodedBytes = currentDecodedBytes;
    this.lastDecodedBytesTime = now;
  }
  
  /**
   * Get current buffer length in seconds
   */
  private getBufferLength(): number {
    if (!this.audioElement) return 0;
    
    const buffered = this.audioElement.buffered;
    const currentTime = this.audioElement.currentTime;
    
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
        return buffered.end(i) - currentTime;
      }
    }
    
    return 0;
  }
  
  /**
   * Get connection info from Navigator.connection
   */
  private getConnectionInfo(): ConnectionInfo | null {
    const nav = navigator as NavigatorWithConnection;
    const conn = nav.connection;
    
    if (!conn) return null;
    
    return {
      effectiveType: conn.effectiveType || 'unknown',
      downlink: conn.downlink || 0,
      rtt: conn.rtt || 0,
      saveData: conn.saveData || false,
    };
  }
  
  /**
   * Calculate rolling average bandwidth
   */
  private calculateAverageBandwidth(): number {
    if (this.rollingBandwidthSamples.length === 0) return 0;
    
    const sum = this.rollingBandwidthSamples.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.rollingBandwidthSamples.length);
  }
}

// Export singleton instance for easy use
let monitorInstance: NativeHLSMonitor | null = null;

export function getNativeHLSMonitor(config?: Partial<NativeHLSMonitorConfig>): NativeHLSMonitor {
  if (!monitorInstance) {
    monitorInstance = new NativeHLSMonitor(config);
  }
  return monitorInstance;
}

export function resetNativeHLSMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = null;
  }
}

