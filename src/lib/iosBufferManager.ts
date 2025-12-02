/**
 * iOS WebKit Buffer Manager
 * 
 * Proactive buffer management for iOS devices on cellular networks.
 * Prevents the ~22-23MB WebKit buffer ceiling crash by:
 * 1. Detecting iOS + cellular network combination
 * 2. Forcing conservative preload mode
 * 3. Monitoring buffer health and proactively recovering
 * 4. Preventing automatic track skips during buffer stalls
 * 
 * This module is specifically designed for the iOS Safari/Chrome WebKit
 * buffering bug that occurs on 5G/LTE with long MP3 files (40-60MB).
 */

// Buffer thresholds (bytes)
const IOS_BUFFER_CONFIG = {
  // WebKit appears to crash around 22-23MB on cellular
  // We'll start proactive recovery at 20MB to be safe
  DANGER_ZONE_BYTES: 20 * 1024 * 1024, // 20MB
  
  // If buffer drops by this much, something is wrong
  BUFFER_DROP_THRESHOLD_BYTES: 1 * 1024 * 1024, // 1MB
  
  // Check buffer health every N milliseconds
  HEALTH_CHECK_INTERVAL_MS: 2000,
  
  // Minimum time between proactive recoveries
  MIN_RECOVERY_INTERVAL_MS: 10000,
  
  // Maximum proactive recoveries per track
  MAX_PROACTIVE_RECOVERIES: 5,
  
  // How far back to seek on recovery (seconds)
  RECOVERY_SEEK_BACK_SECONDS: 2,
  
  // Stall detection threshold (ms without progress)
  STALL_THRESHOLD_MS: 5000,
};

export interface IosBufferDebugState {
  enabled: boolean;
  isIosMobile: boolean;
  isCellular: boolean;
  isMonitoring: boolean;
  currentBufferedBytes: number;
  lastBufferedBytes: number;
  bufferDropDetected: boolean;
  proactiveRecoveryCount: number;
  lastRecoveryTime: number;
  stallDetected: boolean;
  stallDurationMs: number;
  events: BufferEvent[];
}

interface BufferEvent {
  timestamp: string;
  type: 'start' | 'progress' | 'stall' | 'recovery' | 'drop' | 'error' | 'success';
  details: string;
  bufferedBytes?: number;
  currentTime?: number;
}

type BufferRecoveryCallback = (resumePosition: number) => Promise<boolean>;

export class IosBufferManager {
  private isIosMobile: boolean = false;
  private isCellular: boolean = false;
  private isMonitoring: boolean = false;
  private audioElement: HTMLAudioElement | null = null;
  private healthCheckTimer: number | null = null;
  private lastBufferedBytes: number = 0;
  private lastProgressTime: number = 0;
  private proactiveRecoveryCount: number = 0;
  private lastRecoveryTime: number = 0;
  private onRecoveryNeeded: BufferRecoveryCallback | null = null;
  private events: BufferEvent[] = [];
  private maxEvents: number = 100;

  constructor() {
    this.detectEnvironment();
    this.setupNetworkChangeListener();
    this.exposeDebugInterface();
  }

  /**
   * Detect if we're on iOS mobile with cellular connection.
   */
  private detectEnvironment(): void {
    if (typeof navigator === 'undefined') return;

    const ua = navigator.userAgent;
    this.isIosMobile = /iPhone|iPad|iPod/.test(ua);

    // Check network type
    this.updateNetworkStatus();
  }

  /**
   * Update cellular detection status.
   */
  private updateNetworkStatus(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      const type = connection?.type;
      const effectiveType = connection?.effectiveType;
      
      // Consider cellular if type is 'cellular' or if we can't determine
      // and effectiveType suggests mobile network
      this.isCellular = type === 'cellular' || 
                        (type === undefined && effectiveType !== undefined);
      
      this.logEvent('progress', `Network status: type=${type}, effectiveType=${effectiveType}, isCellular=${this.isCellular}`);
    } else {
      // If Network Information API not available, assume cellular on iOS
      // to be safe (WiFi doesn't have the buffer issue anyway)
      this.isCellular = this.isIosMobile;
    }
  }

  /**
   * Listen for network type changes.
   */
  private setupNetworkChangeListener(): void {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection?.addEventListener('change', () => {
        const wasCellular = this.isCellular;
        this.updateNetworkStatus();
        
        if (wasCellular !== this.isCellular) {
          this.logEvent('progress', `Network changed: cellular=${this.isCellular}`);
          
          // If we switched to cellular while playing, start monitoring
          if (this.isCellular && this.audioElement && !this.audioElement.paused) {
            this.startMonitoring(this.audioElement);
          }
          
          // If we switched to WiFi, we can relax
          if (!this.isCellular && this.isMonitoring) {
            this.logEvent('progress', 'Switched to WiFi - relaxing buffer management');
          }
        }
      });
    }
  }

  /**
   * Check if iOS buffer management should be active.
   */
  shouldManageBuffer(): boolean {
    return this.isIosMobile && this.isCellular;
  }

  /**
   * Apply iOS-specific audio element configuration.
   * Call this when creating audio elements on iOS mobile cellular.
   */
  configureAudioElement(audio: HTMLAudioElement): void {
    if (!this.shouldManageBuffer()) {
      return;
    }

    this.logEvent('start', 'Applying iOS cellular buffer configuration');

    // Use metadata preload instead of auto to prevent aggressive buffering
    // This is the KEY change - prevents WebKit from trying to buffer the whole file
    audio.preload = 'metadata';

    this.logEvent('progress', `Set preload='metadata' for iOS cellular`);
  }

  /**
   * Set the recovery callback that will be called when proactive recovery is needed.
   */
  setRecoveryCallback(callback: BufferRecoveryCallback): void {
    this.onRecoveryNeeded = callback;
  }

  /**
   * Start monitoring an audio element for buffer health.
   */
  startMonitoring(audio: HTMLAudioElement): void {
    if (!this.shouldManageBuffer()) {
      return;
    }

    this.audioElement = audio;
    this.isMonitoring = true;
    this.lastBufferedBytes = 0;
    this.lastProgressTime = Date.now();
    this.proactiveRecoveryCount = 0;

    this.logEvent('start', 'Started iOS buffer monitoring');

    // Start health check interval
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = window.setInterval(() => {
      this.checkBufferHealth();
    }, IOS_BUFFER_CONFIG.HEALTH_CHECK_INTERVAL_MS);

    // Also listen to progress events for more immediate detection
    audio.addEventListener('progress', this.handleProgress);
    audio.addEventListener('waiting', this.handleWaiting);
    audio.addEventListener('stalled', this.handleStalled);
  }

  /**
   * Stop monitoring.
   */
  stopMonitoring(): void {
    this.isMonitoring = false;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.audioElement) {
      this.audioElement.removeEventListener('progress', this.handleProgress);
      this.audioElement.removeEventListener('waiting', this.handleWaiting);
      this.audioElement.removeEventListener('stalled', this.handleStalled);
    }

    this.logEvent('progress', 'Stopped iOS buffer monitoring');
  }

  /**
   * Reset state for a new track.
   */
  resetForNewTrack(): void {
    this.proactiveRecoveryCount = 0;
    this.lastRecoveryTime = 0;
    this.lastBufferedBytes = 0;
    this.lastProgressTime = Date.now();
    this.logEvent('start', 'Reset buffer manager for new track');
  }

  /**
   * Handle progress events from audio element.
   */
  private handleProgress = (): void => {
    this.lastProgressTime = Date.now();
  };

  /**
   * Handle waiting events (buffer underrun).
   */
  private handleWaiting = (): void => {
    this.logEvent('stall', 'Audio waiting - buffer underrun detected');
  };

  /**
   * Handle stalled events.
   */
  private handleStalled = (): void => {
    this.logEvent('stall', 'Audio stalled - network fetch stalled');
  };

  /**
   * Periodic buffer health check.
   */
  private checkBufferHealth(): void {
    if (!this.audioElement || !this.isMonitoring) {
      return;
    }

    const audio = this.audioElement;
    
    // Calculate buffered bytes
    let bufferedBytes = 0;
    if (audio.buffered.length > 0 && audio.duration > 0) {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      // Estimate bytes based on typical MP3 bitrate (256kbps for high quality)
      const estimatedBitrate = 256000; // bits per second
      bufferedBytes = Math.floor((bufferedEnd * estimatedBitrate) / 8);
    }

    const currentTime = audio.currentTime;
    const timeSinceProgress = Date.now() - this.lastProgressTime;

    // Check for buffer drop (WebKit bug symptom)
    const bufferDropped = this.lastBufferedBytes > 0 && 
                          bufferedBytes < this.lastBufferedBytes - IOS_BUFFER_CONFIG.BUFFER_DROP_THRESHOLD_BYTES;

    if (bufferDropped) {
      this.logEvent('drop', `Buffer dropped from ${this.formatBytes(this.lastBufferedBytes)} to ${this.formatBytes(bufferedBytes)}`, bufferedBytes, currentTime);
      this.triggerProactiveRecovery('buffer_drop');
    }

    // Check for approaching danger zone
    if (bufferedBytes > IOS_BUFFER_CONFIG.DANGER_ZONE_BYTES) {
      this.logEvent('stall', `Buffer approaching danger zone: ${this.formatBytes(bufferedBytes)}`, bufferedBytes, currentTime);
      // Note: We don't trigger recovery here yet, just log
      // The actual crash triggers when WebKit tries to fetch more
    }

    // Check for stall (no progress for too long)
    if (timeSinceProgress > IOS_BUFFER_CONFIG.STALL_THRESHOLD_MS && !audio.paused) {
      this.logEvent('stall', `Buffer stall detected: ${timeSinceProgress}ms without progress`, bufferedBytes, currentTime);
      this.triggerProactiveRecovery('stall');
    }

    this.lastBufferedBytes = bufferedBytes;
  }

  /**
   * Trigger proactive recovery before an error occurs.
   */
  private async triggerProactiveRecovery(reason: string): Promise<void> {
    const now = Date.now();

    // Rate limit recoveries
    if (now - this.lastRecoveryTime < IOS_BUFFER_CONFIG.MIN_RECOVERY_INTERVAL_MS) {
      this.logEvent('progress', `Recovery rate-limited (last recovery ${now - this.lastRecoveryTime}ms ago)`);
      return;
    }

    // Check max recovery limit
    if (this.proactiveRecoveryCount >= IOS_BUFFER_CONFIG.MAX_PROACTIVE_RECOVERIES) {
      this.logEvent('error', `Max proactive recoveries (${IOS_BUFFER_CONFIG.MAX_PROACTIVE_RECOVERIES}) reached`);
      return;
    }

    if (!this.audioElement || !this.onRecoveryNeeded) {
      return;
    }

    this.proactiveRecoveryCount++;
    this.lastRecoveryTime = now;

    const currentTime = this.audioElement.currentTime;
    const resumePosition = Math.max(0, currentTime - IOS_BUFFER_CONFIG.RECOVERY_SEEK_BACK_SECONDS);

    this.logEvent('recovery', `Triggering proactive recovery #${this.proactiveRecoveryCount} (reason: ${reason}), will resume at ${resumePosition.toFixed(2)}s`);

    try {
      const success = await this.onRecoveryNeeded(resumePosition);
      if (success) {
        this.logEvent('success', `Proactive recovery #${this.proactiveRecoveryCount} succeeded`);
      } else {
        this.logEvent('error', `Proactive recovery #${this.proactiveRecoveryCount} failed`);
      }
    } catch (error) {
      this.logEvent('error', `Proactive recovery #${this.proactiveRecoveryCount} threw: ${error}`);
    }
  }

  /**
   * Log an event to the debug buffer.
   */
  private logEvent(type: BufferEvent['type'], details: string, bufferedBytes?: number, currentTime?: number): void {
    const event: BufferEvent = {
      timestamp: new Date().toISOString(),
      type,
      details,
      bufferedBytes,
      currentTime,
    };

    this.events.push(event);

    // Keep event buffer bounded
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Also log to console in development
    const prefix = `[iOS BUFFER ${type.toUpperCase()}]`;
    if (type === 'error') {
      console.error(prefix, details);
    } else if (type === 'stall' || type === 'drop' || type === 'recovery') {
      console.warn(prefix, details);
    } else {
      console.log(prefix, details);
    }
  }

  /**
   * Format bytes for display.
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  }

  /**
   * Get current debug state.
   */
  getDebugState(): IosBufferDebugState {
    let currentBufferedBytes = 0;
    let stallDurationMs = 0;

    if (this.audioElement && this.audioElement.buffered.length > 0) {
      const bufferedEnd = this.audioElement.buffered.end(this.audioElement.buffered.length - 1);
      const estimatedBitrate = 256000;
      currentBufferedBytes = Math.floor((bufferedEnd * estimatedBitrate) / 8);
    }

    if (this.isMonitoring) {
      stallDurationMs = Date.now() - this.lastProgressTime;
    }

    return {
      enabled: this.shouldManageBuffer(),
      isIosMobile: this.isIosMobile,
      isCellular: this.isCellular,
      isMonitoring: this.isMonitoring,
      currentBufferedBytes,
      lastBufferedBytes: this.lastBufferedBytes,
      bufferDropDetected: false, // Will be set during checks
      proactiveRecoveryCount: this.proactiveRecoveryCount,
      lastRecoveryTime: this.lastRecoveryTime,
      stallDetected: stallDurationMs > IOS_BUFFER_CONFIG.STALL_THRESHOLD_MS,
      stallDurationMs,
      events: [...this.events],
    };
  }

  /**
   * Expose debug interface on window for console debugging.
   */
  private exposeDebugInterface(): void {
    if (typeof window !== 'undefined') {
      (window as any).__iosBufferDebug = {
        getState: () => this.getDebugState(),
        getEvents: () => [...this.events],
        clearEvents: () => { this.events = []; },
        isActive: () => this.shouldManageBuffer(),
        config: IOS_BUFFER_CONFIG,
      };
    }
  }

  /**
   * Cleanup.
   */
  destroy(): void {
    this.stopMonitoring();
    this.audioElement = null;
    this.onRecoveryNeeded = null;
    
    if (typeof window !== 'undefined') {
      delete (window as any).__iosBufferDebug;
    }
  }
}

// Singleton instance
let bufferManagerInstance: IosBufferManager | null = null;

export function getIosBufferManager(): IosBufferManager {
  if (!bufferManagerInstance) {
    bufferManagerInstance = new IosBufferManager();
  }
  return bufferManagerInstance;
}
