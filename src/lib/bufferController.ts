/**
 * Buffer Controller
 * 
 * Provides explicit buffer management for the streaming audio engine.
 * Works with both HLS and direct MP3 playback to ensure optimal buffering
 * across all platforms, especially iOS where buffer limits are critical.
 * 
 * Key Features:
 * - Target buffer size management
 * - Buffer health monitoring
 * - Adaptive buffer adjustment based on network conditions
 * - Safe iOS buffer limits
 * - Buffer starvation detection and recovery
 */

import type { ConnectionQuality } from './types/audioEngine';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface BufferConfig {
  /** Target buffer duration in seconds (how much to buffer ahead) */
  targetBufferDuration: number;
  /** Minimum buffer before playback can start */
  minBufferForPlayback: number;
  /** Maximum buffer size in bytes (important for iOS) */
  maxBufferSizeBytes: number;
  /** Low buffer threshold (triggers rebuffering) */
  lowBufferThreshold: number;
  /** Critical buffer threshold (may cause stall) */
  criticalBufferThreshold: number;
  /** Buffer check interval in ms */
  checkIntervalMs: number;
}

const DEFAULT_BUFFER_CONFIG: BufferConfig = {
  targetBufferDuration: 30,      // 30 seconds ahead
  // [FAST START] Reduced from 5s to 1.5s for faster playback start
  // HLS adaptive bitrate will handle quality adjustments if buffer runs low
  minBufferForPlayback: 1.5,     // 1.5 seconds minimum to start (was 5s)
  maxBufferSizeBytes: 15_000_000, // 15MB - safe for iOS
  lowBufferThreshold: 10,        // Below 10s is low
  criticalBufferThreshold: 3,    // Below 3s is critical
  checkIntervalMs: 1000,         // Check every second
};

// iOS-specific limits (more conservative)
const IOS_BUFFER_CONFIG: Partial<BufferConfig> = {
  targetBufferDuration: 20,      // Reduced for iOS
  maxBufferSizeBytes: 12_000_000, // 12MB - well under iOS limit
  lowBufferThreshold: 8,
  criticalBufferThreshold: 2,
};

// ============================================================================
// TYPES
// ============================================================================

export type BufferHealth = 'healthy' | 'low' | 'critical' | 'empty';

export interface BufferState {
  /** Current buffer duration in seconds */
  bufferDuration: number;
  /** Current buffer size estimate in bytes */
  bufferSizeBytes: number;
  /** Buffer health status */
  health: BufferHealth;
  /** Whether buffer is sufficient for playback */
  canPlay: boolean;
  /** Percentage of target buffer filled */
  fillPercentage: number;
  /** Number of buffered time ranges */
  rangeCount: number;
  /** Gaps in buffer (discontinuities) */
  gaps: BufferGap[];
  /** Whether actively buffering */
  isBuffering: boolean;
  /** Time since last buffer update */
  lastUpdateMs: number;
}

export interface BufferGap {
  start: number;
  end: number;
  duration: number;
}

export interface BufferMetrics {
  /** Average buffer duration over time */
  averageBufferDuration: number;
  /** Number of rebuffering events */
  rebufferingCount: number;
  /** Total time spent rebuffering */
  rebufferingTimeMs: number;
  /** Buffer starvation events */
  starvationCount: number;
  /** Peak buffer size reached */
  peakBufferSizeBytes: number;
  /** Buffer efficiency (time buffered / time played) */
  efficiency: number;
}

type BufferEventCallback = (state: BufferState) => void;

// ============================================================================
// BUFFER CONTROLLER
// ============================================================================

export class BufferController {
  private config: BufferConfig;
  private audio: HTMLAudioElement | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private state: BufferState;
  private metrics: BufferMetrics;
  private callbacks: BufferEventCallback[] = [];
  private isIOS: boolean;
  
  // Internal tracking
  private rebufferingStartTime: number = 0;
  private isRebuffering: boolean = false;
  private bufferHistory: number[] = [];
  private playStartTime: number = 0;
  private totalPlayTime: number = 0;

  constructor(config?: Partial<BufferConfig>) {
    // Detect iOS
    this.isIOS = this.detectIOS();
    
    // Apply config with iOS overrides if needed
    this.config = {
      ...DEFAULT_BUFFER_CONFIG,
      ...(this.isIOS ? IOS_BUFFER_CONFIG : {}),
      ...config,
    };
    
    this.state = this.createInitialState();
    this.metrics = this.createInitialMetrics();
    
    console.log('[BUFFER CONTROLLER] Initialized', {
      isIOS: this.isIOS,
      targetBuffer: this.config.targetBufferDuration,
      maxSize: `${this.config.maxBufferSizeBytes / 1024 / 1024}MB`,
    });
  }

  private detectIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    
    const ua = navigator.userAgent;
    const isIPhone = /iPhone/.test(ua);
    const isIPod = /iPod/.test(ua);
    const isIPadUA = /iPad/.test(ua);
    const isIPadDesktopMode = 
      (navigator as any).platform === 'MacIntel' && 
      (navigator as any).maxTouchPoints > 1;
    
    return isIPhone || isIPod || isIPadUA || isIPadDesktopMode;
  }

  private createInitialState(): BufferState {
    return {
      bufferDuration: 0,
      bufferSizeBytes: 0,
      health: 'empty',
      canPlay: false,
      fillPercentage: 0,
      rangeCount: 0,
      gaps: [],
      isBuffering: false,
      lastUpdateMs: 0,
    };
  }

  private createInitialMetrics(): BufferMetrics {
    return {
      averageBufferDuration: 0,
      rebufferingCount: 0,
      rebufferingTimeMs: 0,
      starvationCount: 0,
      peakBufferSizeBytes: 0,
      efficiency: 1,
    };
  }

  /**
   * Attach the buffer controller to an audio element
   */
  attach(audio: HTMLAudioElement): void {
    if (this.audio) {
      this.detach();
    }
    
    this.audio = audio;
    this.setupEventListeners();
    this.startMonitoring();
    
    console.log('[BUFFER CONTROLLER] Attached to audio element');
  }

  /**
   * Detach from the current audio element
   */
  detach(): void {
    this.stopMonitoring();
    if (this.audio) {
      this.removeEventListeners();
      this.audio = null;
    }
    
    console.log('[BUFFER CONTROLLER] Detached from audio element');
  }

  private setupEventListeners(): void {
    if (!this.audio) return;
    
    this.audio.addEventListener('waiting', this.onWaiting);
    this.audio.addEventListener('playing', this.onPlaying);
    this.audio.addEventListener('progress', this.onProgress);
    this.audio.addEventListener('stalled', this.onStalled);
    this.audio.addEventListener('seeking', this.onSeeking);
  }

  private removeEventListeners(): void {
    if (!this.audio) return;
    
    this.audio.removeEventListener('waiting', this.onWaiting);
    this.audio.removeEventListener('playing', this.onPlaying);
    this.audio.removeEventListener('progress', this.onProgress);
    this.audio.removeEventListener('stalled', this.onStalled);
    this.audio.removeEventListener('seeking', this.onSeeking);
  }

  private onWaiting = (): void => {
    this.state.isBuffering = true;
    
    if (!this.isRebuffering) {
      this.isRebuffering = true;
      this.rebufferingStartTime = performance.now();
      this.metrics.rebufferingCount++;
      
      if (this.state.bufferDuration < this.config.criticalBufferThreshold) {
        this.metrics.starvationCount++;
      }
    }
    
    this.notifyCallbacks();
  };

  private onPlaying = (): void => {
    this.state.isBuffering = false;
    
    if (this.isRebuffering) {
      this.isRebuffering = false;
      const rebufferTime = performance.now() - this.rebufferingStartTime;
      this.metrics.rebufferingTimeMs += rebufferTime;
    }
    
    if (this.playStartTime === 0) {
      this.playStartTime = performance.now();
    }
    
    this.notifyCallbacks();
  };

  private onProgress = (): void => {
    this.updateBufferState();
  };

  private onStalled = (): void => {
    console.log('[BUFFER CONTROLLER] Stalled event');
    this.state.isBuffering = true;
    this.notifyCallbacks();
  };

  private onSeeking = (): void => {
    // Reset buffer tracking after seek
    this.updateBufferState();
  };

  private startMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(() => {
      this.updateBufferState();
    }, this.config.checkIntervalMs);
  }

  private stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private updateBufferState(): void {
    if (!this.audio) return;
    
    const now = performance.now();
    const currentTime = this.audio.currentTime;
    const buffered = this.audio.buffered;
    
    // Calculate buffer duration ahead of current position
    let bufferDuration = 0;
    let bufferEnd = currentTime;
    const gaps: BufferGap[] = [];
    
    for (let i = 0; i < buffered.length; i++) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      
      // Check for gaps
      if (i > 0) {
        const prevEnd = buffered.end(i - 1);
        if (start > prevEnd + 0.5) { // Allow 0.5s tolerance
          gaps.push({
            start: prevEnd,
            end: start,
            duration: start - prevEnd,
          });
        }
      }
      
      // Calculate buffer ahead of current time
      if (end > currentTime && start <= currentTime + 0.5) {
        bufferDuration = end - currentTime;
        bufferEnd = end;
      }
    }
    
    // Estimate buffer size in bytes (rough approximation)
    // Assume ~256kbps audio = 32KB/s
    const bytesPerSecond = 32 * 1024;
    const bufferSizeBytes = bufferDuration * bytesPerSecond;
    
    // Determine health
    let health: BufferHealth = 'healthy';
    if (bufferDuration <= 0) {
      health = 'empty';
    } else if (bufferDuration < this.config.criticalBufferThreshold) {
      health = 'critical';
    } else if (bufferDuration < this.config.lowBufferThreshold) {
      health = 'low';
    }
    
    // Update state
    this.state = {
      bufferDuration,
      bufferSizeBytes,
      health,
      canPlay: bufferDuration >= this.config.minBufferForPlayback,
      fillPercentage: Math.min((bufferDuration / this.config.targetBufferDuration) * 100, 100),
      rangeCount: buffered.length,
      gaps,
      isBuffering: this.state.isBuffering,
      lastUpdateMs: now,
    };
    
    // Update metrics
    this.bufferHistory.push(bufferDuration);
    if (this.bufferHistory.length > 60) {
      this.bufferHistory.shift();
    }
    this.metrics.averageBufferDuration = 
      this.bufferHistory.reduce((a, b) => a + b, 0) / this.bufferHistory.length;
    
    if (bufferSizeBytes > this.metrics.peakBufferSizeBytes) {
      this.metrics.peakBufferSizeBytes = bufferSizeBytes;
    }
    
    // Calculate efficiency
    if (this.playStartTime > 0) {
      this.totalPlayTime = now - this.playStartTime;
      this.metrics.efficiency = this.totalPlayTime > 0 
        ? (this.totalPlayTime - this.metrics.rebufferingTimeMs) / this.totalPlayTime 
        : 1;
    }
    
    // bufferEnd is tracked for potential future use in calculating buffer rate
    void bufferEnd;
    this.notifyCallbacks();
  }

  /**
   * Adjust buffer configuration based on network quality
   */
  adjustForNetwork(quality: ConnectionQuality): void {
    switch (quality) {
      case 'excellent':
        this.config.targetBufferDuration = this.isIOS ? 25 : 40;
        break;
      case 'good':
        this.config.targetBufferDuration = this.isIOS ? 20 : 30;
        break;
      case 'fair':
        this.config.targetBufferDuration = this.isIOS ? 15 : 20;
        break;
      case 'poor':
        this.config.targetBufferDuration = this.isIOS ? 10 : 15;
        break;
      case 'offline':
        // Keep whatever is buffered
        break;
    }
    
    console.log(`[BUFFER CONTROLLER] Adjusted for ${quality} network, target: ${this.config.targetBufferDuration}s`);
  }

  /**
   * Check if buffer size is approaching iOS limit
   */
  isApproachingIOSLimit(): boolean {
    if (!this.isIOS) return false;
    
    const warningThreshold = this.config.maxBufferSizeBytes * 0.8; // 80% of limit
    return this.state.bufferSizeBytes >= warningThreshold;
  }

  /**
   * Get recommendation for buffer management
   */
  getRecommendation(): 'continue' | 'slow_down' | 'pause_prefetch' | 'flush_buffer' {
    if (!this.isIOS) {
      return 'continue';
    }
    
    const sizePercent = this.state.bufferSizeBytes / this.config.maxBufferSizeBytes;
    
    if (sizePercent >= 0.95) {
      return 'flush_buffer';
    } else if (sizePercent >= 0.85) {
      return 'pause_prefetch';
    } else if (sizePercent >= 0.7) {
      return 'slow_down';
    }
    
    return 'continue';
  }

  /**
   * Subscribe to buffer state changes
   */
  onStateChange(callback: BufferEventCallback): () => void {
    this.callbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  private notifyCallbacks(): void {
    const stateCopy = { ...this.state };
    this.callbacks.forEach(cb => cb(stateCopy));
  }

  /**
   * Get current buffer state
   */
  getState(): BufferState {
    return { ...this.state };
  }

  /**
   * Get buffer metrics
   */
  getMetrics(): BufferMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current configuration
   */
  getConfig(): BufferConfig {
    return { ...this.config };
  }

  /**
   * Reset metrics (e.g., for a new track)
   */
  resetMetrics(): void {
    this.metrics = this.createInitialMetrics();
    this.bufferHistory = [];
    this.playStartTime = 0;
    this.totalPlayTime = 0;
    this.totalBufferTime = 0;
    this.isRebuffering = false;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.detach();
    this.callbacks = [];
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a buffer controller with platform-appropriate defaults
 */
export function createBufferController(config?: Partial<BufferConfig>): BufferController {
  return new BufferController(config);
}
