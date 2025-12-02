/**
 * iOS WebKit Buffer Governor
 * 
 * Prevents WebKit on iOS from buffering too much data, which causes
 * NotSupportedError and NETWORK_NO_SOURCE (networkState === 3) errors
 * on long audio tracks (~50MB MP3s).
 * 
 * The governor:
 * 1. Monitors buffer size via audio.buffered and bitrate estimates
 * 2. Throttles prefetching when buffer approaches danger zone
 * 3. Provides recovery mechanisms for buffer-related errors
 * 4. Exposes state for diagnostics
 * 
 * Key thresholds:
 * - BUFFER_LIMIT_BYTES: ~15MB (safe limit before WebKit issues)
 * - PREFETCH_LIMIT_BYTES: ~8MB (when to allow next-track prefetch)
 * - MAX_CONCURRENT_LARGE_TRACKS: 1 (never buffer two large tracks)
 */

import { 
  getIosWebkitInfo, 
  getBufferLimitsForNetwork,
  IosWebkitInfo 
} from './iosWebkitDetection';

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

export const BUFFER_GOVERNOR_CONFIG = {
  // Buffer thresholds (bytes)
  // WebKit crashes around 22-23MB; we stay well under
  DEFAULT_BUFFER_LIMIT_BYTES: 15 * 1024 * 1024,      // 15MB
  CELLULAR_BUFFER_LIMIT_BYTES: 12 * 1024 * 1024,     // 12MB for cellular
  DEFAULT_PREFETCH_LIMIT_BYTES: 8 * 1024 * 1024,     // 8MB
  CELLULAR_PREFETCH_LIMIT_BYTES: 5 * 1024 * 1024,    // 5MB for cellular
  
  // Track size thresholds
  LARGE_TRACK_THRESHOLD_BYTES: 25 * 1024 * 1024,     // 25MB = "large" track
  VERY_LARGE_TRACK_THRESHOLD_BYTES: 40 * 1024 * 1024, // 40MB = "very large"
  
  // Concurrency limits
  MAX_CONCURRENT_LARGE_TRACKS: 1,                    // Only buffer 1 large track
  
  // Recovery settings
  MAX_RECOVERY_ATTEMPTS: 3,                          // Per-track recovery limit
  RECOVERY_JITTER_SECONDS: 2,                        // Seek back on recovery
  RECOVERY_TIMEOUT_MS: 15000,                        // Recovery window
  MIN_POSITION_FOR_RECOVERY: 5,                      // Min playback before recovery
  
  // Monitoring intervals
  BUFFER_CHECK_INTERVAL_MS: 2000,                    // How often to check buffer
  
  // Bitrate estimation (for byte calculations)
  DEFAULT_BITRATE_BPS: 256000,                       // 256kbps default
  HIGH_QUALITY_BITRATE_BPS: 320000,                  // 320kbps for HQ
} as const;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type BufferGovernorErrorType = 
  | 'IOS_WEBKIT_BUFFER_FAILURE'  // Buffer exceeded limit
  | 'NETWORK_NO_SOURCE'          // networkState === 3
  | 'NOT_SUPPORTED_ERROR'        // NotSupportedError from play()
  | 'NETWORK_ERROR'              // Generic network error
  | null;

export interface BufferRecoveryState {
  /** Current error type being handled */
  errorType: BufferGovernorErrorType;
  
  /** Number of recovery attempts for current track */
  attempts: number;
  
  /** Last known good playback position (seconds) */
  lastGoodPosition: number;
  
  /** Last known safe buffer size (bytes) */
  lastGoodBufferedBytes: number;
  
  /** Timestamp of last error */
  lastErrorTimestamp: string | null;
  
  /** URL of track being recovered */
  trackUrl: string | null;
  
  /** Whether recovery is currently in progress */
  isRecovering: boolean;
}

export interface PrefetchState {
  /** Whether prefetching is currently allowed */
  allowed: boolean;
  
  /** Reason for current prefetch state */
  reason: 'bufferUnderLimit' | 'bufferOverLimit' | 'largeTrackOnIOS' | 'recovering' | 'nonIOSPlatform';
  
  /** ID of prefetched track if any */
  prefetchedTrackId: string | null;
}

export interface BufferGovernorState {
  /** Whether governor is active (iOS WebKit detected) */
  active: boolean;
  
  /** Current buffer limit in bytes */
  limitBytes: number;
  
  /** Estimated current buffer size in bytes */
  estimatedBufferedBytes: number;
  
  /** Whether current track is considered "large" */
  isLargeTrack: boolean;
  
  /** Estimated track size in bytes */
  estimatedTrackSizeBytes: number;
  
  /** Whether governor is currently throttling */
  isThrottling: boolean;
  
  /** iOS WebKit environment info */
  iosInfo: IosWebkitInfo;
  
  /** Recovery state */
  recovery: BufferRecoveryState;
  
  /** Prefetch state */
  prefetch: PrefetchState;
}

export interface BufferGovernorCallbacks {
  /** Called when buffer throttling starts */
  onThrottleStart?: () => void;
  
  /** Called when buffer throttling ends */
  onThrottleEnd?: () => void;
  
  /** Called when recovery is needed */
  onRecoveryNeeded?: (position: number) => Promise<boolean>;
  
  /** Called when recovery fails and track should skip */
  onRecoveryExhausted?: () => void;
}

// ============================================================================
// BUFFER GOVERNOR CLASS
// ============================================================================

export class IosBufferGovernor {
  private state: BufferGovernorState;
  private audioElement: HTMLAudioElement | null = null;
  private callbacks: BufferGovernorCallbacks = {};
  private monitoringInterval: number | null = null;
  private lastLogTime: number = 0;
  private logThrottleMs: number = 5000;

  constructor() {
    const iosInfo = getIosWebkitInfo();
    const limits = getBufferLimitsForNetwork(iosInfo);

    this.state = {
      active: iosInfo.isIOSWebKit,
      limitBytes: limits.bufferLimitBytes,
      estimatedBufferedBytes: 0,
      isLargeTrack: false,
      estimatedTrackSizeBytes: 0,
      isThrottling: false,
      iosInfo,
      recovery: {
        errorType: null,
        attempts: 0,
        lastGoodPosition: 0,
        lastGoodBufferedBytes: 0,
        lastErrorTimestamp: null,
        trackUrl: null,
        isRecovering: false,
      },
      prefetch: {
        allowed: !iosInfo.isIOSWebKit,
        reason: iosInfo.isIOSWebKit ? 'largeTrackOnIOS' : 'nonIOSPlatform',
        prefetchedTrackId: null,
      },
    };

    this.log('Governor initialized', {
      active: this.state.active,
      browser: iosInfo.browserName,
      cellular: iosInfo.isCellular,
      limitMB: (limits.bufferLimitBytes / (1024 * 1024)).toFixed(1),
    });

    this.exposeDebugInterface();
  }

  // --------------------------------------------------------------------------
  // PUBLIC API
  // --------------------------------------------------------------------------

  /**
   * Set callbacks for governor events.
   */
  setCallbacks(callbacks: BufferGovernorCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Configure audio element for iOS WebKit.
   * Call this when creating audio elements.
   */
  configureAudioElement(audio: HTMLAudioElement): void {
    if (!this.state.active) {
      return;
    }

    // Use metadata preload to prevent aggressive buffering
    audio.preload = 'metadata';
    
    this.log('Configured audio element', { preload: audio.preload });
  }

  /**
   * Start monitoring an audio element for buffer size.
   */
  startMonitoring(audio: HTMLAudioElement): void {
    this.audioElement = audio;

    if (!this.state.active) {
      return;
    }

    this.stopMonitoring();

    this.monitoringInterval = window.setInterval(() => {
      this.checkBufferHealth();
    }, BUFFER_GOVERNOR_CONFIG.BUFFER_CHECK_INTERVAL_MS);

    // Also update on progress events
    audio.addEventListener('progress', this.handleProgress);
    audio.addEventListener('timeupdate', this.handleTimeUpdate);

    this.log('Started buffer monitoring');
  }

  /**
   * Stop monitoring.
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.audioElement) {
      this.audioElement.removeEventListener('progress', this.handleProgress);
      this.audioElement.removeEventListener('timeupdate', this.handleTimeUpdate);
    }
  }

  /**
   * Reset state for a new track.
   * Call this when loading a new track.
   */
  resetForNewTrack(estimatedSizeBytes?: number): void {
    this.state.recovery = {
      errorType: null,
      attempts: 0,
      lastGoodPosition: 0,
      lastGoodBufferedBytes: 0,
      lastErrorTimestamp: null,
      trackUrl: null,
      isRecovering: false,
    };

    this.state.estimatedBufferedBytes = 0;
    this.state.isThrottling = false;

    if (estimatedSizeBytes !== undefined) {
      this.state.estimatedTrackSizeBytes = estimatedSizeBytes;
      this.state.isLargeTrack = estimatedSizeBytes > BUFFER_GOVERNOR_CONFIG.LARGE_TRACK_THRESHOLD_BYTES;
    } else {
      this.state.estimatedTrackSizeBytes = 0;
      this.state.isLargeTrack = false;
    }

    this.updatePrefetchState();

    this.log('Reset for new track', {
      estimatedSizeMB: (this.state.estimatedTrackSizeBytes / (1024 * 1024)).toFixed(1),
      isLarge: this.state.isLargeTrack,
    });
  }

  /**
   * Set estimated track size.
   * Call this when track metadata becomes available.
   */
  setTrackSize(sizeBytes: number): void {
    this.state.estimatedTrackSizeBytes = sizeBytes;
    this.state.isLargeTrack = sizeBytes > BUFFER_GOVERNOR_CONFIG.LARGE_TRACK_THRESHOLD_BYTES;
    this.updatePrefetchState();

    this.log('Track size updated', {
      sizeMB: (sizeBytes / (1024 * 1024)).toFixed(1),
      isLarge: this.state.isLargeTrack,
    });
  }

  /**
   * Check if prefetching is currently allowed.
   */
  canPrefetch(): boolean {
    return this.state.prefetch.allowed;
  }

  /**
   * Record that a track has been prefetched.
   */
  recordPrefetch(trackId: string): void {
    this.state.prefetch.prefetchedTrackId = trackId;
  }

  /**
   * Handle an error from the audio element.
   * Returns true if this is a buffer-related error we should attempt to recover.
   */
  handleError(error: Error | MediaError | null, networkState: number): boolean {
    if (!this.state.active) {
      return false;
    }

    const errorType = this.classifyError(error, networkState);

    if (!errorType) {
      return false;
    }

    this.state.recovery.errorType = errorType;
    this.state.recovery.lastErrorTimestamp = new Date().toISOString();
    this.state.recovery.trackUrl = this.audioElement?.src || null;

    this.log('Buffer-related error detected', {
      type: errorType,
      networkState,
      attempts: this.state.recovery.attempts,
      position: this.state.recovery.lastGoodPosition.toFixed(2),
    });

    return true;
  }

  /**
   * Attempt to recover from a buffer-related error.
   * Returns true if recovery was successful.
   */
  async attemptRecovery(): Promise<boolean> {
    if (!this.state.active || !this.callbacks.onRecoveryNeeded) {
      return false;
    }

    const recovery = this.state.recovery;

    // Check if we should attempt recovery
    if (recovery.attempts >= BUFFER_GOVERNOR_CONFIG.MAX_RECOVERY_ATTEMPTS) {
      this.log('Recovery exhausted', { attempts: recovery.attempts });
      recovery.isRecovering = false;
      
      if (this.callbacks.onRecoveryExhausted) {
        this.callbacks.onRecoveryExhausted();
      }
      return false;
    }

    // Check minimum position requirement
    if (recovery.lastGoodPosition < BUFFER_GOVERNOR_CONFIG.MIN_POSITION_FOR_RECOVERY) {
      this.log('Position too early for recovery', { 
        position: recovery.lastGoodPosition,
        minimum: BUFFER_GOVERNOR_CONFIG.MIN_POSITION_FOR_RECOVERY,
      });
      return false;
    }

    recovery.attempts++;
    recovery.isRecovering = true;

    const resumePosition = Math.max(
      0,
      recovery.lastGoodPosition - BUFFER_GOVERNOR_CONFIG.RECOVERY_JITTER_SECONDS
    );

    this.log('Attempting recovery', {
      attempt: recovery.attempts,
      maxAttempts: BUFFER_GOVERNOR_CONFIG.MAX_RECOVERY_ATTEMPTS,
      resumeAt: resumePosition.toFixed(2),
      errorType: recovery.errorType,
    });

    try {
      const success = await this.callbacks.onRecoveryNeeded(resumePosition);

      if (success) {
        this.log('Recovery successful', { attempt: recovery.attempts });
        recovery.errorType = null;
        recovery.isRecovering = false;
        return true;
      } else {
        this.log('Recovery callback returned false', { attempt: recovery.attempts });
      }
    } catch (error) {
      this.log('Recovery threw error', { 
        attempt: recovery.attempts,
        error: String(error),
      });
    }

    recovery.isRecovering = false;

    // If we've exhausted attempts
    if (recovery.attempts >= BUFFER_GOVERNOR_CONFIG.MAX_RECOVERY_ATTEMPTS) {
      if (this.callbacks.onRecoveryExhausted) {
        this.callbacks.onRecoveryExhausted();
      }
    }

    return false;
  }

  /**
   * Get current governor state (for diagnostics).
   */
  getState(): BufferGovernorState {
    return { ...this.state };
  }

  /**
   * Check if governor is active.
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Force activate governor for testing.
   * @internal Test hook only
   */
  _forceActivate(active: boolean): void {
    this.state.active = active;
    this.log('Governor activation forced', { active });
  }

  /**
   * Simulate a buffer failure for testing.
   * @internal Test hook only
   */
  _simulateBufferFailure(): void {
    this.state.recovery.errorType = 'IOS_WEBKIT_BUFFER_FAILURE';
    this.state.recovery.lastErrorTimestamp = new Date().toISOString();
    this.log('Simulated buffer failure');
  }

  /**
   * Cleanup.
   */
  destroy(): void {
    this.stopMonitoring();
    this.audioElement = null;
    this.callbacks = {};

    if (typeof window !== 'undefined') {
      delete (window as any).__bufferGovernorDebug;
    }
  }

  // --------------------------------------------------------------------------
  // PRIVATE METHODS
  // --------------------------------------------------------------------------

  private handleProgress = (): void => {
    this.updateBufferEstimate();
    this.updatePrefetchState();
  };

  private handleTimeUpdate = (): void => {
    if (!this.audioElement) return;

    // Track last good position for recovery
    const audio = this.audioElement;
    if (audio.readyState >= 2 && audio.networkState === 2 && audio.currentTime > 0) {
      this.state.recovery.lastGoodPosition = audio.currentTime;
      this.state.recovery.lastGoodBufferedBytes = this.state.estimatedBufferedBytes;
    }
  };

  private checkBufferHealth(): void {
    this.updateBufferEstimate();

    if (!this.state.active) return;

    const bufferBytes = this.state.estimatedBufferedBytes;
    const limitBytes = this.state.limitBytes;

    // Check if we're approaching the danger zone
    const bufferRatio = bufferBytes / limitBytes;
    const wasThrottling = this.state.isThrottling;

    if (bufferRatio > 0.9) {
      // Buffer is getting dangerously high
      if (!this.state.isThrottling) {
        this.state.isThrottling = true;
        this.logThrottled('Buffer approaching limit - throttling', {
          bufferMB: (bufferBytes / (1024 * 1024)).toFixed(2),
          limitMB: (limitBytes / (1024 * 1024)).toFixed(2),
          ratio: (bufferRatio * 100).toFixed(1) + '%',
        });
        
        if (this.callbacks.onThrottleStart) {
          this.callbacks.onThrottleStart();
        }
      }
    } else if (bufferRatio < 0.7) {
      // Buffer is back to safe levels
      if (this.state.isThrottling) {
        this.state.isThrottling = false;
        this.log('Buffer under control - unthrottling', {
          bufferMB: (bufferBytes / (1024 * 1024)).toFixed(2),
          ratio: (bufferRatio * 100).toFixed(1) + '%',
        });
        
        if (this.callbacks.onThrottleEnd) {
          this.callbacks.onThrottleEnd();
        }
      }
    }

    this.updatePrefetchState();
  }

  private updateBufferEstimate(): void {
    if (!this.audioElement) return;

    const audio = this.audioElement;
    
    if (audio.buffered.length > 0 && audio.duration > 0) {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      
      // Estimate bytes based on duration and assumed bitrate
      // Use higher bitrate estimate for safety (overestimate buffer)
      const bitrate = this.state.isLargeTrack 
        ? BUFFER_GOVERNOR_CONFIG.HIGH_QUALITY_BITRATE_BPS
        : BUFFER_GOVERNOR_CONFIG.DEFAULT_BITRATE_BPS;
      
      this.state.estimatedBufferedBytes = Math.floor((bufferedEnd * bitrate) / 8);
      
      // Also update track size estimate if we don't have it
      if (this.state.estimatedTrackSizeBytes === 0) {
        this.state.estimatedTrackSizeBytes = Math.floor((audio.duration * bitrate) / 8);
        this.state.isLargeTrack = this.state.estimatedTrackSizeBytes > 
          BUFFER_GOVERNOR_CONFIG.LARGE_TRACK_THRESHOLD_BYTES;
      }
    }
  }

  private updatePrefetchState(): void {
    if (!this.state.active) {
      this.state.prefetch = {
        allowed: true,
        reason: 'nonIOSPlatform',
        prefetchedTrackId: this.state.prefetch.prefetchedTrackId,
      };
      return;
    }

    // Don't allow prefetch during recovery
    if (this.state.recovery.isRecovering) {
      this.state.prefetch = {
        allowed: false,
        reason: 'recovering',
        prefetchedTrackId: this.state.prefetch.prefetchedTrackId,
      };
      return;
    }

    // Don't allow prefetch for large tracks until buffer is low
    if (this.state.isLargeTrack) {
      const prefetchLimit = this.state.iosInfo.isCellular
        ? BUFFER_GOVERNOR_CONFIG.CELLULAR_PREFETCH_LIMIT_BYTES
        : BUFFER_GOVERNOR_CONFIG.DEFAULT_PREFETCH_LIMIT_BYTES;

      if (this.state.estimatedBufferedBytes > prefetchLimit) {
        this.state.prefetch = {
          allowed: false,
          reason: 'largeTrackOnIOS',
          prefetchedTrackId: this.state.prefetch.prefetchedTrackId,
        };
        return;
      }
    }

    // Check general buffer limit
    if (this.state.isThrottling) {
      this.state.prefetch = {
        allowed: false,
        reason: 'bufferOverLimit',
        prefetchedTrackId: this.state.prefetch.prefetchedTrackId,
      };
      return;
    }

    this.state.prefetch = {
      allowed: true,
      reason: 'bufferUnderLimit',
      prefetchedTrackId: this.state.prefetch.prefetchedTrackId,
    };
  }

  private classifyError(error: Error | MediaError | null, networkState: number): BufferGovernorErrorType {
    // Check for NotSupportedError
    if (error && error.message?.includes('NotSupported')) {
      return 'NOT_SUPPORTED_ERROR';
    }

    // Check for networkState === 3 (NETWORK_NO_SOURCE)
    if (networkState === 3) {
      // If buffer was high, this is likely a buffer failure
      if (this.state.estimatedBufferedBytes > 
          BUFFER_GOVERNOR_CONFIG.LARGE_TRACK_THRESHOLD_BYTES * 0.5) {
        return 'IOS_WEBKIT_BUFFER_FAILURE';
      }
      return 'NETWORK_NO_SOURCE';
    }

    // Check for generic network error
    if (error instanceof MediaError && error.code === MediaError.MEDIA_ERR_NETWORK) {
      // If buffer was high, this is likely a buffer failure
      if (this.state.estimatedBufferedBytes > 
          BUFFER_GOVERNOR_CONFIG.LARGE_TRACK_THRESHOLD_BYTES * 0.5) {
        return 'IOS_WEBKIT_BUFFER_FAILURE';
      }
      return 'NETWORK_ERROR';
    }

    return null;
  }

  private log(message: string, data?: Record<string, any>): void {
    const prefix = '[IOS_BUFFER]';
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  private logThrottled(message: string, data?: Record<string, any>): void {
    const now = Date.now();
    if (now - this.lastLogTime < this.logThrottleMs) {
      return;
    }
    this.lastLogTime = now;
    this.log(message, data);
  }

  private exposeDebugInterface(): void {
    if (typeof window !== 'undefined') {
      (window as any).__bufferGovernorDebug = {
        getState: () => this.getState(),
        isActive: () => this.isActive(),
        canPrefetch: () => this.canPrefetch(),
        config: BUFFER_GOVERNOR_CONFIG,
        forceActivate: (active: boolean) => this._forceActivate(active),
        simulateFailure: () => this._simulateBufferFailure(),
      };
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let governorInstance: IosBufferGovernor | null = null;

/**
 * Get the singleton buffer governor instance.
 */
export function getIosBufferGovernor(): IosBufferGovernor {
  if (!governorInstance) {
    governorInstance = new IosBufferGovernor();
  }
  return governorInstance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetIosBufferGovernor(): void {
  if (governorInstance) {
    governorInstance.destroy();
    governorInstance = null;
  }
}
