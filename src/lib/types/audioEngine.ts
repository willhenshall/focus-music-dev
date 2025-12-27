/**
 * Audio Engine Type Definitions
 * 
 * Shared types for both legacy EnterpriseAudioEngine and new StreamingAudioEngine.
 * This allows for gradual migration and A/B testing between engines.
 */

// ============================================================================
// ERROR TYPES
// ============================================================================

export type ErrorCategory = 
  | 'network' 
  | 'decode' 
  | 'auth' 
  | 'cors' 
  | 'timeout' 
  | 'hls' 
  | 'unknown';

// ============================================================================
// PLAYBACK STATE
// ============================================================================

export type PlaybackState = 
  | 'idle' 
  | 'loading' 
  | 'ready' 
  | 'playing' 
  | 'paused' 
  | 'stopped' 
  | 'error'
  | 'buffering';

export type ConnectionQuality = 
  | 'excellent' 
  | 'good' 
  | 'fair' 
  | 'poor' 
  | 'offline';

export type CircuitBreakerState = 
  | 'closed' 
  | 'open' 
  | 'half-open';

/**
 * Crossfade mode for track transitions.
 * - 'overlap': Radio-style - next track starts early, both play simultaneously during fade
 * - 'sequential': Current track fades out completely, then next track fades in
 * - 'none': No fading, immediate cut between tracks
 */
export type CrossfadeMode = 'overlap' | 'sequential' | 'none';

// ============================================================================
// METRICS
// ============================================================================

export interface AudioMetrics {
  // Track info
  currentTrackId: string | null;
  currentTrackUrl: string | null;
  storageBackend: string;
  
  // Load timing
  loadStartTime: number;
  loadEndTime: number;
  loadDuration: number;
  
  // HTML5 Audio state
  networkState: number;
  networkStateLabel: string;
  readyState: number;
  readyStateLabel: string;
  
  // Playback state
  playbackState: PlaybackState;
  currentTime: number;
  duration: number;
  buffered: number;
  bufferPercentage: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  
  // Error state
  error: string | null;
  errorCategory: ErrorCategory | null;
  
  // Status flags
  isStalled: boolean;
  isWaiting: boolean;
  canPlayThrough: boolean;
  mediaSessionActive: boolean;
  
  // Dual audio element state (for gapless)
  audioElement: 'primary' | 'secondary' | null;
  
  // Prefetch state
  prefetchedTrackId: string | null;
  prefetchedTrackUrl: string | null;
  prefetchProgress: number;
  prefetchReadyState: number;
  
  // Network metrics
  estimatedBandwidth: number;
  bytesLoaded: number;
  totalBytes: number;
  downloadSpeed: number;
  isOnline: boolean;
  connectionQuality: ConnectionQuality;
  
  // Retry state
  retryAttempt: number;
  maxRetries: number;
  nextRetryIn: number;
  
  // Circuit breaker
  circuitBreakerState: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  sessionSuccessRate: number;
  
  // Recovery
  stallCount: number;
  recoveryAttempts: number;
  
  // iOS clamp state (legacy - for backwards compatibility)
  iosClamp: {
    isIOSWebKit: boolean;
    isClampActive: boolean;
    bufferLimitMB: number;
    currentBufferMB: number;
    prefetchDisabled: boolean;
  };
  
  // HLS-specific metrics (new)
  hls?: HLSMetrics;
}

export interface HLSMetrics {
  /** Whether HLS is being used for current track */
  isHLSActive: boolean;
  /** Current HLS level/quality index */
  currentLevel: number;
  /** Available HLS levels */
  levels: HLSLevel[];
  /** Current bandwidth estimate from hls.js */
  bandwidthEstimate: number;
  /** Number of segments in buffer */
  bufferedSegments: number;
  /** Buffer length in seconds */
  bufferLength: number;
  /** Target buffer length */
  targetBuffer: number;
  /** Whether using native HLS (Safari) */
  isNativeHLS: boolean;
  /** HLS loading latency */
  latency: number;
  /** Fragment loading stats */
  fragmentStats: {
    loaded: number;
    failed: number;
    retried: number;
  };
  /** ABR (Adaptive Bitrate) detailed metrics */
  abr: ABRMetrics;
}

export interface ABRMetrics {
  /** Auto level switching enabled */
  autoLevelEnabled: boolean;
  /** The level that ABR wants to use (-1 = auto) */
  autoLevel: number;
  /** Next auto level that will be loaded */
  nextAutoLevel: number;
  /** Manual level override (-1 = auto) */
  manualLevel: number;
  /** Load level - currently loading */
  loadLevel: number;
  /** Next load level - will load next */
  nextLoadLevel: number;
  /** Level switch history (last 10 switches) */
  levelSwitchHistory: LevelSwitch[];
  /** Timestamp of last level switch */
  lastLevelSwitchTime: number;
  /** Total number of level switches */
  totalLevelSwitches: number;
  /** ABR controller state */
  abrState: string;
  /** Effective bandwidth used for decisions (can differ from estimate) */
  effectiveBandwidth: number;
  /** Current quality tier name (low/medium/high/premium) */
  currentQualityTier: string;
  /** Recommended quality tier based on bandwidth */
  recommendedQualityTier: string;
  /** Whether currently upgrading quality */
  isUpgrading: boolean;
  /** Whether currently downgrading quality */
  isDowngrading: boolean;
  /** Time since last level switch */
  timeSinceSwitch: number;
}

export interface LevelSwitch {
  timestamp: number;
  fromLevel: number;
  toLevel: number;
  reason: string;
  bandwidth: number;
}

export interface HLSLevel {
  index: number;
  bitrate: number;
  width?: number;
  height?: number;
  codecSet?: string;
  /** Quality tier name (low/medium/high/premium) */
  tierName?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  timeoutPerAttempt: number;
  overallTimeout: number;
  jitterFactor: number;
}

export interface HLSConfig {
  /** Maximum buffer length in seconds */
  maxBufferLength: number;
  /** Maximum max buffer length (hls.js will not buffer beyond this) */
  maxMaxBufferLength: number;
  /** Maximum buffer size in bytes */
  maxBufferSize: number;
  /** Maximum gap in buffer before seeking */
  maxBufferHole: number;
  /** Enable low latency mode */
  lowLatencyMode: boolean;
  /** Start level for ABR (-1 = auto) */
  startLevel: number;
  /** Enable ABR controller */
  abrEwmaDefaultEstimate: number;
}

// ============================================================================
// STORAGE ADAPTER
// ============================================================================

export interface StorageAdapter {
  name: string;
  getAudioUrl(filePath: string): Promise<string>;
  validateUrl(url: string): boolean;
  getRegionalEndpoint?(region: string): string;
}

export interface HLSStorageAdapter extends StorageAdapter {
  getHLSUrl(trackId: string, hlsPath: string): Promise<string>;
  hasHLSSupport(trackId: string): Promise<boolean>;
}

// ============================================================================
// TRACK INFO
// ============================================================================

export interface TrackMetadata {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  artwork?: string;
}

export interface TrackInfo {
  trackId: string;
  filePath: string;
  hlsPath?: string;
  duration?: number;
  metadata?: TrackMetadata;
}

// ============================================================================
// CALLBACKS
// ============================================================================

export type TrackLoadCallback = (trackId: string, duration: number) => void;
export type TrackEndCallback = () => void;
export type DiagnosticsUpdateCallback = (metrics: AudioMetrics) => void;
export type ErrorCallback = (error: Error, category: ErrorCategory, canRetry: boolean) => void;

/**
 * Performance mark callback for TTFA instrumentation.
 * Called when key events occur in the audio loading pipeline.
 */
export type PerfMarkType = 'sourceSelectedAt' | 'manifestParsedAt';
export type PerfMarkCallback = (markType: PerfMarkType, audioType: 'hls' | 'mp3') => void;

export interface AudioEngineCallbacks {
  onTrackLoad?: TrackLoadCallback;
  onTrackEnd?: TrackEndCallback;
  onDiagnosticsUpdate?: DiagnosticsUpdateCallback;
  onError?: ErrorCallback;
  /** Optional: called for TTFA performance marks during loading */
  onPerfMark?: PerfMarkCallback;
}

// ============================================================================
// ENGINE INTERFACE
// ============================================================================

/**
 * Common interface for both legacy and streaming audio engines.
 * Allows for easy swapping between implementations.
 */
export interface IAudioEngine {
  // Playback control
  loadTrack(trackId: string, filePath: string, metadata?: TrackMetadata): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  
  // Volume
  setVolume(value: number): void;
  getVolume(): number;
  
  // State
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  
  // Metrics
  getMetrics(): AudioMetrics;
  
  // Configuration
  setCallbacks(callbacks: AudioEngineCallbacks): void;
  setCrossfadeEnabled(enabled: boolean): void;
  setStorageAdapter(adapter: StorageAdapter): void;
  
  // Crossfade configuration
  /**
   * Set crossfade mode: 'overlap' (radio-style), 'sequential', or 'none'
   */
  setCrossfadeMode(mode: CrossfadeMode): void;
  /**
   * Set crossfade duration in milliseconds (default: 500ms)
   */
  setCrossfadeDuration(durationMs: number): void;
  /**
   * Get current crossfade mode
   */
  getCrossfadeMode(): CrossfadeMode;
  /**
   * Get current crossfade duration in milliseconds
   */
  getCrossfadeDuration(): number;
  
  // Prefetch
  prefetchNextTrack(trackId: string, filePath: string): void;
  
  // iOS-specific
  /**
   * [iOS FIX] Unlock iOS audio context synchronously from a user gesture.
   * Must be called BEFORE any async operations to preserve user gesture context.
   * Optional - only implemented by StreamingAudioEngine.
   */
  unlockIOSAudio?(): void;
  
  // Cleanup
  destroy(): void;
}
