/**
 * Streaming Audio Engine
 * 
 * Industry-standard audio engine using HLS (HTTP Live Streaming) for reliable
 * playback across all platforms, especially iOS. This engine replaces the
 * HTML5 Audio-based EnterpriseAudioEngine with proper streaming support.
 * 
 * Key Features:
 * - HLS streaming with hls.js (non-Safari) or native HLS (Safari)
 * - Explicit buffer management to avoid iOS crashes
 * - Adaptive bitrate streaming based on network conditions
 * - Gapless playback with dual audio element architecture
 * - MediaSession API for lock screen controls
 * - Fallback to direct MP3 for non-HLS tracks
 * 
 * This matches the architecture used by Spotify, Apple Music, and YouTube Music.
 */

import Hls from 'hls.js';
import type {
  AudioMetrics,
  HLSMetrics,
  HLSConfig,
  RetryConfig,
  StorageAdapter,
  HLSStorageAdapter,
  TrackMetadata,
  AudioEngineCallbacks,
  ErrorCategory,
  PlaybackState,
  ConnectionQuality,
  CircuitBreakerState,
  IAudioEngine,
} from './types/audioEngine';

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_HLS_CONFIG: HLSConfig = {
  maxBufferLength: 30,           // Buffer 30 seconds ahead
  maxMaxBufferLength: 60,        // Never buffer more than 60 seconds
  maxBufferSize: 15_000_000,     // 15MB max buffer - safe for iOS
  maxBufferHole: 0.5,            // Max gap allowed in buffer
  lowLatencyMode: false,         // Not needed for music
  startLevel: -1,                // Auto-select quality
  abrEwmaDefaultEstimate: 500000, // 500kbps initial estimate
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelay: 500,
  maxDelay: 8000,
  timeoutPerAttempt: 15000,
  overallTimeout: 45000,
  jitterFactor: 0.3,
};

// [CELLBUG FIX] Extended timeouts for cellular/throttled networks
const CELLULAR_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 8,              // More retries on cell
  baseDelay: 1000,             // Longer base delay
  maxDelay: 15000,             // Longer max delay
  timeoutPerAttempt: 45000,    // 45 seconds per attempt (vs 15s for WiFi)
  overallTimeout: 120000,      // 2 minutes overall (vs 45s for WiFi)
  jitterFactor: 0.3,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if browser should use native HLS (Safari/iOS only)
 * Chrome reports 'maybe' for HLS but doesn't fully support ABR,
 * so we only use native for actual Safari/iOS where it works properly.
 */
function supportsNativeHLS(): boolean {
  // Only use native HLS for Safari/iOS - Chrome's partial support doesn't work well for ABR
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  if (!isSafari && !isIOS) {
    return false; // Use HLS.js for Chrome, Firefox, etc.
  }
  
  const video = document.createElement('video');
  return Boolean(
    video.canPlayType('application/vnd.apple.mpegurl') ||
    video.canPlayType('audio/mpegurl')
  );
}

/**
 * Check if browser supports hls.js
 */
function supportsHLSJS(): boolean {
  return Hls.isSupported();
}

/**
 * Detect iOS WebKit for special handling
 */
function isIOSWebKit(): boolean {
  const ua = navigator.userAgent;
  const isIPhone = /iPhone/.test(ua);
  const isIPod = /iPod/.test(ua);
  const isIPadUA = /iPad/.test(ua);
  const isIPadDesktopMode = 
    navigator.platform === 'MacIntel' && 
    navigator.maxTouchPoints > 1;
  
  return isIPhone || isIPod || isIPadUA || isIPadDesktopMode;
}

/**
 * Format time as MM:SS
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// STREAMING AUDIO ENGINE
// ============================================================================

export class StreamingAudioEngine implements IAudioEngine {
  // Audio elements
  private primaryAudio: HTMLAudioElement;
  private secondaryAudio: HTMLAudioElement;
  private currentAudio: HTMLAudioElement;
  private nextAudio: HTMLAudioElement;
  
  // HLS instances
  private primaryHls: Hls | null = null;
  private secondaryHls: Hls | null = null;
  private currentHls: Hls | null = null;
  
  // State
  private currentTrackId: string | null = null;
  private nextTrackId: string | null = null;
  private volume: number = 0.7;
  private isPlayingState: boolean = false;
  private crossfadeDuration: number = 1000;
  private enableCrossfade: boolean = true;
  private prefetchedNextTrack: boolean = false;
  
  // Configuration
  private storageAdapter: StorageAdapter;
  private hlsConfig: HLSConfig;
  private retryConfig: RetryConfig;
  
  // Callbacks
  private onTrackLoad: AudioEngineCallbacks['onTrackLoad'] | null = null;
  private onTrackEnd: AudioEngineCallbacks['onTrackEnd'] | null = null;
  private onDiagnosticsUpdate: AudioEngineCallbacks['onDiagnosticsUpdate'] | null = null;
  private onError: AudioEngineCallbacks['onError'] | null = null;
  
  // Metrics
  private metrics: AudioMetrics;
  private hlsMetrics: HLSMetrics;
  
  // Internal state
  private metricsUpdateFrame: number | null = null;
  private circuitBreakerFailures: number = 0;
  private circuitBreakerThreshold: number = 5;
  private circuitBreakerResetTime: number = 30000;
  private circuitBreakerTimer: NodeJS.Timeout | null = null;
  private stallDetectionTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  
  // [FAST START] Startup latency instrumentation
  private startupTimestamps: {
    playRequested: number;
    sourceSet: number;
    hlsManifestLoaded: number;
    canPlayFired: number;
    firstTimeupdateFired: number;
    playbackStarted: number;
  } = {
    playRequested: 0,
    sourceSet: 0,
    hlsManifestLoaded: 0,
    canPlayFired: 0,
    firstTimeupdateFired: 0,
    playbackStarted: 0,
  };
  private isFirstTimeupdate: boolean = true;
  
  // Feature detection
  private useNativeHLS: boolean;
  private useHLSJS: boolean;
  private isIOS: boolean;
  
  // [CELLBUG FIX] Track cellular connection status for more lenient handling
  private isCellular: boolean = false;
  
  // [CELLBUG FIX] Stall recovery for streaming engine (similar to EnterpriseAudioEngine)
  private stallRecoveryTimer: NodeJS.Timeout | null = null;
  private stallRecoveryAttempts: number = 0;
  private readonly CELL_STALL_TIMEOUT = 15000;  // 15s stall timeout for cell
  private readonly WIFI_STALL_TIMEOUT = 8000;   // 8s for WiFi
  private readonly CELL_MAX_STALL_RECOVERY = 6; // 6 attempts for cell
  private readonly WIFI_MAX_STALL_RECOVERY = 3; // 3 for WiFi

  constructor(storageAdapter: StorageAdapter, hlsConfig?: Partial<HLSConfig>) {
    this.storageAdapter = storageAdapter;
    this.hlsConfig = { ...DEFAULT_HLS_CONFIG, ...hlsConfig };
    this.retryConfig = DEFAULT_RETRY_CONFIG;
    
    // Feature detection
    this.useNativeHLS = supportsNativeHLS();
    this.useHLSJS = supportsHLSJS();
    this.isIOS = isIOSWebKit();
    
    console.log('[STREAMING ENGINE] Initializing', {
      useNativeHLS: this.useNativeHLS,
      useHLSJS: this.useHLSJS,
      isIOS: this.isIOS,
    });
    
    // Initialize metrics
    this.metrics = this.createInitialMetrics();
    this.hlsMetrics = this.createInitialHLSMetrics();
    this.metrics.storageBackend = storageAdapter.name;
    
    // Create audio elements
    this.primaryAudio = this.createAudioElement();
    this.secondaryAudio = this.createAudioElement();
    this.currentAudio = this.primaryAudio;
    this.nextAudio = this.secondaryAudio;
    
    // Set initial volumes
    this.primaryAudio.volume = this.volume;
    this.secondaryAudio.volume = 0;
    
    // Initialize HLS if supported and not using native
    if (this.useHLSJS && !this.useNativeHLS) {
      this.primaryHls = this.createHLSInstance(this.primaryAudio);
      this.secondaryHls = this.createHLSInstance(this.secondaryAudio);
      this.currentHls = this.primaryHls;
    }
    
    // Setup monitoring
    this.setupNetworkMonitoring();
    this.startMetricsLoop();
    this.initializeMediaSession();
  }

  private createInitialMetrics(): AudioMetrics {
    return {
      currentTrackId: null,
      currentTrackUrl: null,
      storageBackend: '',
      loadStartTime: 0,
      loadEndTime: 0,
      loadDuration: 0,
      networkState: 0,
      networkStateLabel: 'NETWORK_EMPTY',
      readyState: 0,
      readyStateLabel: 'HAVE_NOTHING',
      playbackState: 'idle',
      currentTime: 0,
      duration: 0,
      buffered: 0,
      bufferPercentage: 0,
      volume: 0.7,
      muted: false,
      playbackRate: 1.0,
      error: null,
      errorCategory: null,
      isStalled: false,
      isWaiting: false,
      canPlayThrough: false,
      mediaSessionActive: false,
      audioElement: null,
      prefetchedTrackId: null,
      prefetchedTrackUrl: null,
      prefetchProgress: 0,
      prefetchReadyState: 0,
      estimatedBandwidth: 0,
      bytesLoaded: 0,
      totalBytes: 0,
      downloadSpeed: 0,
      isOnline: navigator.onLine,
      connectionQuality: 'good',
      retryAttempt: 0,
      maxRetries: 5,
      nextRetryIn: 0,
      circuitBreakerState: 'closed',
      failureCount: 0,
      successCount: 0,
      sessionSuccessRate: 100,
      stallCount: 0,
      recoveryAttempts: 0,
      iosClamp: {
        isIOSWebKit: this.isIOS,
        isClampActive: false,
        bufferLimitMB: 0,
        currentBufferMB: 0,
        prefetchDisabled: false,
      },
    };
  }

  private createInitialHLSMetrics(): HLSMetrics {
    return {
      isHLSActive: false,
      currentLevel: -1,
      levels: [],
      bandwidthEstimate: 0,
      bufferedSegments: 0,
      bufferLength: 0,
      targetBuffer: this.hlsConfig.maxBufferLength,
      isNativeHLS: this.useNativeHLS,
      latency: 0,
      fragmentStats: {
        loaded: 0,
        failed: 0,
        retried: 0,
      },
      abr: {
        autoLevelEnabled: true,
        autoLevel: -1,
        nextAutoLevel: -1,
        manualLevel: -1,
        loadLevel: -1,
        nextLoadLevel: -1,
        levelSwitchHistory: [],
        lastLevelSwitchTime: 0,
        totalLevelSwitches: 0,
        abrState: 'idle',
        effectiveBandwidth: 0,
        currentQualityTier: 'unknown',
        recommendedQualityTier: 'unknown',
        isUpgrading: false,
        isDowngrading: false,
        timeSinceSwitch: 0,
      },
    };
  }

  private getQualityTierName(level: number): string {
    // Map level index to quality tier name based on our 4-bitrate ladder
    const tierNames = ['low', 'medium', 'high', 'premium'];
    if (level < 0) return 'auto';
    if (level >= tierNames.length) return `L${level}`;
    return tierNames[level];
  }

  private getRecommendedTier(bandwidthBps: number): string {
    // Recommend quality tier based on available bandwidth
    // Our ladder: 32k(48k overhead), 64k(96k), 96k(144k), 128k(192k)
    const kbps = bandwidthBps / 1000;
    if (kbps >= 250) return 'premium';  // 128k needs ~192kbps overhead
    if (kbps >= 180) return 'high';      // 96k needs ~144kbps overhead
    if (kbps >= 120) return 'medium';    // 64k needs ~96kbps overhead
    return 'low';                         // 32k needs ~48kbps overhead
  }

  private createAudioElement(): HTMLAudioElement {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.setAttribute('playsinline', 'true');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    
    // Event listeners
    audio.addEventListener('canplaythrough', () => {
      this.metrics.error = null;
      this.metrics.errorCategory = null;
      this.updateMetrics();
    });
    
    // [FAST START] Track canplay for startup latency
    audio.addEventListener('canplay', () => {
      if (this.startupTimestamps.canPlayFired === 0 && this.startupTimestamps.sourceSet > 0) {
        this.startupTimestamps.canPlayFired = performance.now();
        const timeFromSource = this.startupTimestamps.canPlayFired - this.startupTimestamps.sourceSet;
        console.log('[AUDIO][STARTUP][CANPLAY] Can play fired', {
          timeFromSourceMs: Math.round(timeFromSource),
          timeFromPlayRequestMs: this.startupTimestamps.playRequested > 0 
            ? Math.round(this.startupTimestamps.canPlayFired - this.startupTimestamps.playRequested)
            : 'N/A (prefetched)',
          readyState: audio.readyState,
        });
      }
    });
    
    audio.addEventListener('loadedmetadata', () => {
      this.updateMetrics();
    });
    
    audio.addEventListener('progress', () => {
      this.updateMetrics();
      this.updateConnectionQuality();
    });
    
    audio.addEventListener('timeupdate', () => {
      // [FAST START] Track first timeupdate as actual playback start
      if (this.isFirstTimeupdate && audio.currentTime > 0 && audio === this.currentAudio) {
        this.isFirstTimeupdate = false;
        this.startupTimestamps.firstTimeupdateFired = performance.now();
        
        // Log complete startup latency breakdown
        const breakdown = {
          totalStartupMs: this.startupTimestamps.playRequested > 0
            ? Math.round(this.startupTimestamps.firstTimeupdateFired - this.startupTimestamps.playRequested)
            : 'N/A',
          sourceToCanPlayMs: this.startupTimestamps.canPlayFired > 0 && this.startupTimestamps.sourceSet > 0
            ? Math.round(this.startupTimestamps.canPlayFired - this.startupTimestamps.sourceSet)
            : 'N/A',
          canPlayToPlayingMs: this.startupTimestamps.playbackStarted > 0 && this.startupTimestamps.canPlayFired > 0
            ? Math.round(this.startupTimestamps.playbackStarted - this.startupTimestamps.canPlayFired)
            : 'N/A',
          playingToFirstAudioMs: this.startupTimestamps.playbackStarted > 0
            ? Math.round(this.startupTimestamps.firstTimeupdateFired - this.startupTimestamps.playbackStarted)
            : 'N/A',
          wasPrefetched: this.startupTimestamps.playRequested === 0 || 
            this.startupTimestamps.sourceSet < this.startupTimestamps.playRequested,
        };
        console.log('[AUDIO][STARTUP][COMPLETE] First audio output', breakdown);
      }
      this.updateMetrics();
    });
    
    audio.addEventListener('waiting', () => {
      // [CELLBUG FIX] Log waiting events for diagnostics
      console.log('[AUDIO][CELLBUG][EVENT] Waiting event', {
        currentTime: audio.currentTime,
        duration: audio.duration,
        buffered: audio.buffered.length > 0 ? audio.buffered.end(audio.buffered.length - 1) : 0,
        readyState: audio.readyState,
        networkState: audio.networkState,
        isIOS: this.isIOS,
        isCellular: this.isCellular,
        connectionQuality: this.metrics.connectionQuality,
      });
      
      this.metrics.isWaiting = true;
      this.metrics.playbackState = 'buffering';
      this.updateMetrics();
      
      // [CELLBUG FIX] Start stall recovery timer if playing
      if (this.isPlayingState && audio === this.currentAudio) {
        this.startStallRecovery(audio);
      }
    });
    
    audio.addEventListener('playing', () => {
      // [CELLBUG FIX] Log playing events to track recovery
      console.log('[AUDIO][CELLBUG][EVENT] Playing event - playback resumed', {
        currentTime: audio.currentTime,
        duration: audio.duration,
        wasStalled: this.metrics.isStalled,
        wasWaiting: this.metrics.isWaiting,
        stallRecoveryAttempts: this.stallRecoveryAttempts,
      });
      
      this.metrics.isWaiting = false;
      this.metrics.isStalled = false;
      this.metrics.playbackState = 'playing';
      if (audio === this.currentAudio) {
        this.metrics.error = null;
        this.metrics.errorCategory = null;
        this.metrics.retryAttempt = 0;
        this.consecutiveStallFailures = 0;  // [CELLBUG FIX] Reset on successful play
        this.stallRecoveryAttempts = 0;     // [CELLBUG FIX] Reset stall recovery counter
        this.cancelStallRecovery();          // [CELLBUG FIX] Cancel pending recovery
      }
      this.updateMetrics();
    });
    
    audio.addEventListener('stalled', () => {
      // [CELLBUG FIX] Log stalled events for diagnostics
      console.log('[AUDIO][CELLBUG][EVENT] Stalled event', {
        currentTime: audio.currentTime,
        duration: audio.duration,
        buffered: audio.buffered.length > 0 ? audio.buffered.end(audio.buffered.length - 1) : 0,
        readyState: audio.readyState,
        networkState: audio.networkState,
        isIOS: this.isIOS,
        connectionQuality: this.metrics.connectionQuality,
        stallCount: this.metrics.stallCount + 1,
      });
      
      this.metrics.isStalled = true;
      this.metrics.stallCount++;
      this.updateMetrics();
    });
    
    audio.addEventListener('error', () => {
      const error = audio.error;
      if (error && audio === this.currentAudio) {
        const { message, category } = this.categorizeError(error);
        this.metrics.error = message;
        this.metrics.errorCategory = category;
        this.updateMetrics();
      }
    });
    
    return audio;
  }

  private createHLSInstance(audio: HTMLAudioElement): Hls {
    // [CELLBUG FIX] Use extended timeouts for cellular/throttled networks
    const fragTimeout = this.isCellular ? 60000 : 20000;      // 60s for cell, 20s for WiFi
    const fragRetries = this.isCellular ? 10 : 6;             // 10 retries for cell, 6 for WiFi
    const levelTimeout = this.isCellular ? 30000 : 10000;     // 30s for cell, 10s for WiFi
    const manifestTimeout = this.isCellular ? 30000 : 10000;  // 30s for cell, 10s for WiFi
    
    // [CELLBUG FIX] Lower initial bandwidth estimate on slow networks
    // This makes HLS start with lower quality (if available) instead of buffering
    const initialBandwidthEstimate = this.isCellular 
      ? 150000   // 150 kbps - assume very slow on cellular/throttled
      : this.hlsConfig.abrEwmaDefaultEstimate;  // 500 kbps default
    
    console.log('[AUDIO][CELLBUG][HLS] Creating HLS instance', {
      fragTimeout,
      fragRetries,
      levelTimeout,
      manifestTimeout,
      initialBandwidthEstimate,
      isCellular: this.isCellular,
    });
    
    const hls = new Hls({
      maxBufferLength: this.hlsConfig.maxBufferLength,
      maxMaxBufferLength: this.hlsConfig.maxMaxBufferLength,
      maxBufferSize: this.hlsConfig.maxBufferSize,
      maxBufferHole: this.hlsConfig.maxBufferHole,
      lowLatencyMode: this.hlsConfig.lowLatencyMode,
      startLevel: this.hlsConfig.startLevel,
      abrEwmaDefaultEstimate: initialBandwidthEstimate,
      // [CELLBUG FIX] Enable ABR (adaptive bitrate) switching
      abrBandWidthFactor: 0.8,        // Be conservative - use 80% of measured bandwidth
      abrBandWidthUpFactor: 0.5,      // Be very conservative when upgrading quality
      // Additional optimizations for audio
      enableWorker: true,
      // [CELLBUG FIX] Extended timeouts for cellular networks
      fragLoadingTimeOut: fragTimeout,
      fragLoadingMaxRetry: fragRetries,
      levelLoadingTimeOut: levelTimeout,
      manifestLoadingTimeOut: manifestTimeout,
    });
    
    // Attach to audio element
    hls.attachMedia(audio);
    
    // HLS event handlers
    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      // [CELLBUG FIX] Log available quality levels for ABR
      const levelInfo = data.levels.map((level: any, index: number) => ({
        index,
        bitrate: level.bitrate,
        bitrateKbps: Math.round(level.bitrate / 1000),
      }));
      
      console.log('[AUDIO][CELLBUG][HLS] Manifest parsed', {
        levelCount: data.levels.length,
        levels: levelInfo,
        hasMultipleQualities: data.levels.length > 1,
        isCellular: this.isCellular,
      });
      
      // Warn if only single quality available (no ABR possible)
      if (data.levels.length === 1) {
        console.warn('[AUDIO][CELLBUG][HLS] ⚠️ Only 1 quality level available - ABR cannot help on slow networks. Consider encoding audio at multiple bitrates.');
      }
      
      const tierNames = ['low', 'medium', 'high', 'premium'];
      this.hlsMetrics.levels = data.levels.map((level: any, index: number) => ({
        index,
        bitrate: level.bitrate,
        width: level.width,
        height: level.height,
        codecSet: level.codecSet,
        tierName: tierNames[index] || `L${index}`,
      }));
      this.updateMetrics();
    });
    
    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      const previousLevel = this.hlsMetrics.currentLevel;
      const newLevel = data.level;
      const level = this.hlsMetrics.levels[newLevel];
      const now = Date.now();
      
      // Determine if upgrading or downgrading
      const isUpgrading = newLevel > previousLevel && previousLevel >= 0;
      const isDowngrading = newLevel < previousLevel && previousLevel >= 0;
      
      console.log('[AUDIO][CELLBUG][HLS] Level switched', {
        previousLevel,
        newLevel,
        tierName: this.getQualityTierName(newLevel),
        bitrate: level?.bitrate,
        bitrateKbps: level?.bitrate ? Math.round(level.bitrate / 1000) : 'unknown',
        isUpgrading,
        isDowngrading,
        bandwidth: this.hlsMetrics.bandwidthEstimate,
      });
      
      // Record level switch in history
      if (previousLevel >= 0) {
        const switchRecord = {
          timestamp: now,
          fromLevel: previousLevel,
          toLevel: newLevel,
          reason: isDowngrading ? 'bandwidth_drop' : isUpgrading ? 'bandwidth_increase' : 'initial',
          bandwidth: this.hlsMetrics.bandwidthEstimate,
        };
        this.hlsMetrics.abr.levelSwitchHistory.push(switchRecord);
        // Keep only last 10 switches
        if (this.hlsMetrics.abr.levelSwitchHistory.length > 10) {
          this.hlsMetrics.abr.levelSwitchHistory.shift();
        }
        this.hlsMetrics.abr.totalLevelSwitches++;
      }
      
      // Update ABR metrics
      this.hlsMetrics.currentLevel = newLevel;
      this.hlsMetrics.abr.lastLevelSwitchTime = now;
      this.hlsMetrics.abr.isUpgrading = isUpgrading;
      this.hlsMetrics.abr.isDowngrading = isDowngrading;
      this.hlsMetrics.abr.currentQualityTier = this.getQualityTierName(newLevel);
      
      this.updateMetrics();
    });
    
    hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
      this.hlsMetrics.fragmentStats.loaded++;
      if (data.frag.stats) {
        this.hlsMetrics.latency = data.frag.stats.loading.end - data.frag.stats.loading.start;
      }
      this.updateMetrics();
    });
    
    hls.on(Hls.Events.FRAG_LOAD_EMERGENCY_ABORTED, () => {
      this.hlsMetrics.fragmentStats.failed++;
      this.updateMetrics();
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
      // [CELLBUG FIX] Enhanced error logging for HLS issues
      console.log('[AUDIO][CELLBUG][HLS] HLS Error event', {
        type: data.type,
        details: data.details,
        fatal: data.fatal,
        isIOS: this.isIOS,
        connectionQuality: this.metrics.connectionQuality,
        networkState: audio.networkState,
        readyState: audio.readyState,
        currentTime: audio.currentTime,
        duration: audio.duration,
      });
      
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // [CELLBUG FIX] On network errors, try to recover more aggressively
            console.log('[AUDIO][CELLBUG][HLS] Fatal network error, attempting recovery with startLoad()');
            this.consecutiveStallFailures++;
            
            // If too many consecutive failures, let the error propagate
            if (this.consecutiveStallFailures >= 5) {
              console.log('[AUDIO][CELLBUG][HLS] Too many network failures, propagating error');
              this.metrics.error = `HLS Network Error: ${data.details}`;
              this.metrics.errorCategory = 'network';
              if (this.onError) {
                this.onError(new Error(data.details), 'network', false);
              }
            } else {
              // Try to recover
              hls.startLoad();
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('[AUDIO][CELLBUG][HLS] Fatal media error, attempting recovery with recoverMediaError()');
            hls.recoverMediaError();
            break;
          default:
            console.error('[AUDIO][CELLBUG][HLS] Unrecoverable error:', data.details);
            this.metrics.error = `HLS Error: ${data.details}`;
            this.metrics.errorCategory = 'hls';
            if (this.onError) {
              this.onError(new Error(data.details), 'hls', false);
            }
            break;
        }
      } else {
        // Non-fatal errors - just log for diagnostics
        console.log('[AUDIO][CELLBUG][HLS] Non-fatal error (will auto-recover):', data.details);
      }
    });
    
    hls.on(Hls.Events.BUFFER_APPENDED, () => {
      // Update buffer metrics
      if (hls.media) {
        const buffered = hls.media.buffered;
        if (buffered.length > 0) {
          const bufferEnd = buffered.end(buffered.length - 1);
          const currentTime = hls.media.currentTime;
          this.hlsMetrics.bufferLength = bufferEnd - currentTime;
          this.hlsMetrics.bufferedSegments = buffered.length;
        }
      }
      this.updateMetrics();
    });
    
    return hls;
  }

  private setupNetworkMonitoring(): void {
    window.addEventListener('online', () => {
      console.log('[AUDIO][CELLBUG][NETWORK] Online event - connection restored');
      this.metrics.isOnline = true;
      this.metrics.connectionQuality = 'good';
      this.consecutiveStallFailures = 0;  // [CELLBUG FIX] Reset failures when back online
      this.resetCircuitBreaker();
      this.updateConnectionQuality();  // [CELLBUG FIX] Also update cellular status
      this.updateMetrics();
    });
    
    window.addEventListener('offline', () => {
      console.log('[AUDIO][CELLBUG][NETWORK] Offline event - connection lost');
      this.metrics.isOnline = false;
      this.metrics.connectionQuality = 'offline';
      this.updateMetrics();
      if (this.isPlayingState) {
        this.pause();
      }
    });
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isPlayingState && this.currentAudio.paused) {
        console.log('[AUDIO][CELLBUG][VISIBILITY] Resuming after visibility change');
        this.currentAudio.play().catch((err) => {
          console.warn('[AUDIO][CELLBUG][VISIBILITY] Failed to resume:', err);
        });
      }
    });
    
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection?.addEventListener('change', () => {
        console.log('[AUDIO][CELLBUG][NETWORK] Connection change event');
        this.updateConnectionQuality();
      });
      
      // [CELLBUG FIX] Initialize cellular detection immediately
      this.updateConnectionQuality();
    }
  }

  private updateConnectionQuality(): void {
    if (!navigator.onLine) {
      this.metrics.connectionQuality = 'offline';
      this.isCellular = false;
      return;
    }
    
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      const effectiveType = connection?.effectiveType;
      const connectionType = connection?.type;
      const downlink = connection?.downlink;  // Mbps
      
      // [CELLBUG FIX] Detect "slow network" conditions for more lenient handling
      // Use BOTH connection type AND effectiveType for better detection:
      // - connectionType === 'cellular' means actual cellular network
      // - effectiveType === '2g'/'3g'/'slow-2g' means slow network (works with DevTools throttling!)
      // - downlink < 1 Mbps also indicates slow network
      const isSlowEffectiveType = effectiveType === '2g' || effectiveType === 'slow-2g' || effectiveType === '3g';
      const isSlowDownlink = downlink !== undefined && downlink < 1;  // Less than 1 Mbps
      
      this.isCellular = connectionType === 'cellular' || 
                        isSlowEffectiveType ||
                        isSlowDownlink ||
                        (this.isIOS && connectionType !== 'wifi' && connectionType !== 'ethernet');
      
      console.log('[AUDIO][CELLBUG][NETWORK] Connection updated', {
        effectiveType,
        connectionType,
        downlink,
        isSlowEffectiveType,
        isSlowDownlink,
        isCellular: this.isCellular,
        isIOS: this.isIOS,
      });
      
      switch (effectiveType) {
        case '4g':
          this.metrics.connectionQuality = 'excellent';
          break;
        case '3g':
          this.metrics.connectionQuality = 'good';
          break;
        case '2g':
          this.metrics.connectionQuality = 'fair';
          break;
        case 'slow-2g':
          this.metrics.connectionQuality = 'poor';
          break;
        default:
          // Use HLS bandwidth estimate if available
          if (this.currentHls && this.hlsMetrics.bandwidthEstimate > 0) {
            const kbps = this.hlsMetrics.bandwidthEstimate / 1000;
            if (kbps > 2000) {
              this.metrics.connectionQuality = 'excellent';
            } else if (kbps > 500) {
              this.metrics.connectionQuality = 'good';
            } else if (kbps > 200) {
              this.metrics.connectionQuality = 'fair';
            } else {
              this.metrics.connectionQuality = 'poor';
            }
          }
      }
    }
  }

  private initializeMediaSession(): void {
    if ('mediaSession' in navigator) {
      this.metrics.mediaSessionActive = true;
      
      navigator.mediaSession.setActionHandler('play', () => {
        this.play();
      });
      
      navigator.mediaSession.setActionHandler('pause', () => {
        this.pause();
      });
      
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (this.onTrackEnd) {
          this.onTrackEnd();
        }
      });
      
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          this.seek(details.seekTime);
        }
      });
    }
  }

  private updateMediaSessionMetadata(metadata?: TrackMetadata): void {
    if ('mediaSession' in navigator && metadata?.trackName) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: metadata.trackName,
        artist: metadata.artistName || 'focus.music',
        album: metadata.albumName || 'Focus Music',
        artwork: metadata.artwork ? [{ src: metadata.artwork }] : undefined,
      });
    }
  }

  private categorizeError(error: MediaError): { message: string; category: ErrorCategory } {
    let message = 'Unknown error';
    let category: ErrorCategory = 'unknown';
    
    switch (error.code) {
      case error.MEDIA_ERR_ABORTED:
        message = 'Playback aborted';
        category = 'unknown';
        break;
      case error.MEDIA_ERR_NETWORK:
        message = 'Network error while loading media';
        category = 'network';
        break;
      case error.MEDIA_ERR_DECODE:
        message = 'Media decoding error';
        category = 'decode';
        break;
      case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
        message = 'Media format not supported';
        category = 'cors';
        break;
    }
    
    return { message, category };
  }

  private startMetricsLoop(): void {
    const updateLoop = () => {
      this.updateMetrics();
      this.metricsUpdateFrame = requestAnimationFrame(updateLoop);
    };
    updateLoop();
  }

  private updateMetrics(): void {
    const audio = this.currentAudio;
    
    this.metrics.networkState = audio.networkState;
    this.metrics.readyState = audio.readyState;
    this.metrics.currentTime = audio.currentTime;
    this.metrics.duration = audio.duration || 0;
    this.metrics.volume = this.volume;
    this.metrics.muted = audio.muted;
    this.metrics.playbackRate = audio.playbackRate;
    this.metrics.canPlayThrough = audio.readyState >= 4;
    this.metrics.audioElement = audio === this.primaryAudio ? 'primary' : 'secondary';
    
    // Buffer info
    if (audio.buffered.length > 0 && audio.duration) {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      this.metrics.buffered = bufferedEnd;
      this.metrics.bufferPercentage = (bufferedEnd / audio.duration) * 100;
    }
    
    // HLS metrics
    if (this.currentHls && this.hlsMetrics.isHLSActive) {
      const hls = this.currentHls;
      
      // Bandwidth
      this.hlsMetrics.bandwidthEstimate = hls.bandwidthEstimate || 0;
      this.metrics.estimatedBandwidth = Math.floor(this.hlsMetrics.bandwidthEstimate / 1000);
      
      // ABR state from hls.js
      this.hlsMetrics.abr.autoLevelEnabled = hls.autoLevelEnabled;
      this.hlsMetrics.abr.autoLevel = hls.autoLevelCapping >= 0 ? hls.autoLevelCapping : hls.currentLevel;
      this.hlsMetrics.abr.nextAutoLevel = hls.nextAutoLevel;
      this.hlsMetrics.abr.manualLevel = hls.manualLevel;
      this.hlsMetrics.abr.loadLevel = hls.loadLevel;
      this.hlsMetrics.abr.nextLoadLevel = hls.nextLoadLevel;
      this.hlsMetrics.abr.effectiveBandwidth = hls.bandwidthEstimate || 0;
      
      // Quality tier recommendations
      this.hlsMetrics.abr.currentQualityTier = this.getQualityTierName(hls.currentLevel);
      this.hlsMetrics.abr.recommendedQualityTier = this.getRecommendedTier(hls.bandwidthEstimate || 0);
      
      // Time since last switch
      if (this.hlsMetrics.abr.lastLevelSwitchTime > 0) {
        this.hlsMetrics.abr.timeSinceSwitch = Date.now() - this.hlsMetrics.abr.lastLevelSwitchTime;
      }
      
      // Determine ABR state
      const currentLevel = hls.currentLevel;
      const recommendedLevel = this.hlsMetrics.levels.findIndex(
        l => l.tierName === this.hlsMetrics.abr.recommendedQualityTier
      );
      if (currentLevel < 0) {
        this.hlsMetrics.abr.abrState = 'initializing';
      } else if (currentLevel === recommendedLevel) {
        this.hlsMetrics.abr.abrState = 'optimal';
      } else if (currentLevel < recommendedLevel) {
        this.hlsMetrics.abr.abrState = 'upgrading';
      } else {
        this.hlsMetrics.abr.abrState = 'downgraded';
      }
    }
    
    // Include HLS metrics in main metrics
    this.metrics.hls = { ...this.hlsMetrics };
    
    // [FAST START] Include startup latency metrics
    if (this.startupTimestamps.playRequested > 0 || this.startupTimestamps.sourceSet > 0) {
      const totalLatency = this.startupTimestamps.firstTimeupdateFired > 0 && this.startupTimestamps.playRequested > 0
        ? this.startupTimestamps.firstTimeupdateFired - this.startupTimestamps.playRequested
        : 0;
      const bufferingLatency = this.startupTimestamps.canPlayFired > 0 && this.startupTimestamps.sourceSet > 0
        ? this.startupTimestamps.canPlayFired - this.startupTimestamps.sourceSet
        : 0;
      
      this.metrics.startupLatency = {
        playRequestedAt: this.startupTimestamps.playRequested,
        sourceSetAt: this.startupTimestamps.sourceSet,
        canPlayAt: this.startupTimestamps.canPlayFired,
        playbackStartedAt: this.startupTimestamps.playbackStarted,
        firstAudioAt: this.startupTimestamps.firstTimeupdateFired,
        totalLatencyMs: Math.round(totalLatency),
        bufferingLatencyMs: Math.round(bufferingLatency),
        wasPrefetched: this.startupTimestamps.sourceSet < this.startupTimestamps.playRequested,
      };
    }
    
    if (this.onDiagnosticsUpdate) {
      this.onDiagnosticsUpdate({ ...this.metrics });
    }
  }

  private recordSuccess(): void {
    this.circuitBreakerFailures = 0;
    this.metrics.successCount++;
    this.updateSessionSuccessRate();
    
    if (this.metrics.circuitBreakerState === 'half-open') {
      this.closeCircuitBreaker();
    }
  }

  private recordFailure(): void {
    this.circuitBreakerFailures++;
    this.metrics.failureCount++;
    this.updateSessionSuccessRate();
    
    if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
      this.openCircuitBreaker();
    }
  }

  private updateSessionSuccessRate(): void {
    const total = this.metrics.successCount + this.metrics.failureCount;
    if (total > 0) {
      this.metrics.sessionSuccessRate = Math.round((this.metrics.successCount / total) * 100);
    }
  }

  private openCircuitBreaker(): void {
    this.metrics.circuitBreakerState = 'open';
    this.updateMetrics();
    
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
    }
    
    this.circuitBreakerTimer = setTimeout(() => {
      this.metrics.circuitBreakerState = 'half-open';
      this.updateMetrics();
    }, this.circuitBreakerResetTime);
  }

  private closeCircuitBreaker(): void {
    this.metrics.circuitBreakerState = 'closed';
    this.circuitBreakerFailures = 0;
    this.updateMetrics();
  }

  private resetCircuitBreaker(): void {
    this.circuitBreakerFailures = 0;
    this.metrics.circuitBreakerState = 'closed';
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
    this.updateMetrics();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  setCallbacks(callbacks: AudioEngineCallbacks): void {
    if (callbacks.onTrackLoad) this.onTrackLoad = callbacks.onTrackLoad;
    if (callbacks.onTrackEnd) this.onTrackEnd = callbacks.onTrackEnd;
    if (callbacks.onDiagnosticsUpdate) this.onDiagnosticsUpdate = callbacks.onDiagnosticsUpdate;
    if (callbacks.onError) this.onError = callbacks.onError;
  }

  setCrossfadeEnabled(enabled: boolean): void {
    this.enableCrossfade = enabled;
  }

  setStorageAdapter(adapter: StorageAdapter): void {
    this.storageAdapter = adapter;
    this.metrics.storageBackend = adapter.name;
    this.updateMetrics();
  }

  async loadTrack(
    trackId: string,
    filePath: string,
    metadata?: TrackMetadata
  ): Promise<void> {
    if (this.metrics.circuitBreakerState === 'open') {
      throw new Error('Circuit breaker is open - too many recent failures');
    }

    // [PREFETCH FIX] Clean up prefetch listeners BEFORE loading new track
    // The nextAudio element might have prefetch listeners that interfere with loading
    this.cleanupPrefetchListeners();
    
    // Reset prefetch state since we're loading a new track
    this.prefetchedNextTrack = false;
    this.nextTrackId = null;
    this.metrics.prefetchedTrackId = null;
    this.metrics.prefetchedTrackUrl = null;
    this.metrics.prefetchProgress = 0;
    this.metrics.prefetchReadyState = 0;

    // [FAST START] Reset startup timestamps for new track load
    this.resetStartupTimestamps();

    this.metrics.loadStartTime = performance.now();
    this.metrics.playbackState = 'loading';
    this.metrics.error = null;
    this.metrics.errorCategory = null;
    this.metrics.retryAttempt = 0;
    this.metrics.recoveryAttempts = 0;
    this.currentTrackId = trackId;

    // [FAST START] Mark source set time
    this.startupTimestamps.sourceSet = performance.now();

    console.log('[AUDIO][STARTUP][LOAD] Loading track', { trackId, filePath });

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    
    // [FIX] Clear the nextAudio source to prevent stale state
    // This ensures we start fresh when loading a new track
    if (this.nextAudio.src) {
      this.nextAudio.pause();
      this.nextAudio.removeAttribute('src');
      this.nextAudio.load(); // Reset the element
    }
    
    try {
      // Check if HLS is available for this track
      const hlsAdapter = this.storageAdapter as HLSStorageAdapter;
      const hasHLS = hlsAdapter.hasHLSSupport 
        ? await hlsAdapter.hasHLSSupport(trackId)
        : false;
      
      if (hasHLS && (this.useNativeHLS || this.useHLSJS)) {
        await this.loadHLSTrack(trackId, filePath, metadata);
      } else {
        await this.loadDirectTrack(trackId, filePath, metadata);
      }
      
      this.recordSuccess();
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private async loadHLSTrack(
    trackId: string,
    filePath: string,
    metadata?: TrackMetadata
  ): Promise<void> {
    console.log('[STREAMING ENGINE] Loading HLS track:', trackId);
    
    const hlsAdapter = this.storageAdapter as HLSStorageAdapter;
    const hlsUrl = await hlsAdapter.getHLSUrl(trackId, `${trackId}/master.m3u8`);
    
    this.metrics.currentTrackUrl = hlsUrl;
    this.metrics.currentTrackId = trackId;
    this.hlsMetrics.isHLSActive = true;
    
    if (this.useNativeHLS) {
      // Native HLS (Safari/iOS) - just set the source
      this.hlsMetrics.isNativeHLS = true;
      this.nextAudio.src = hlsUrl;
      await this.waitForCanPlay(this.nextAudio);
    } else {
      // hls.js - use the HLS instance attached to nextAudio
      // [FIX] Previously used this.currentHls which may be attached to currentAudio
      const hlsForNextAudio = this.nextAudio === this.primaryAudio 
        ? this.primaryHls 
        : this.secondaryHls;
      
      if (hlsForNextAudio) {
        this.hlsMetrics.isNativeHLS = false;
        hlsForNextAudio.loadSource(hlsUrl);
        await this.waitForHLSReady(hlsForNextAudio);
      } else {
        // Fallback: just set src directly
        this.nextAudio.src = hlsUrl;
        await this.waitForCanPlay(this.nextAudio);
      }
    }
    
    if (metadata) {
      this.updateMediaSessionMetadata(metadata);
    }
    
    this.metrics.loadEndTime = performance.now();
    this.metrics.loadDuration = this.metrics.loadEndTime - this.metrics.loadStartTime;
    this.metrics.playbackState = 'ready';
    
    this.setupTrackEndHandler();
    
    if (this.onTrackLoad) {
      this.onTrackLoad(trackId, this.nextAudio.duration);
    }
  }

  private async loadDirectTrack(
    trackId: string,
    filePath: string,
    metadata?: TrackMetadata
  ): Promise<void> {
    console.log('[STREAMING ENGINE] Loading direct MP3 track:', trackId);
    
    const url = await this.storageAdapter.getAudioUrl(filePath);
    
    this.metrics.currentTrackUrl = url;
    this.metrics.currentTrackId = trackId;
    this.hlsMetrics.isHLSActive = false;
    
    this.nextAudio.src = url;
    await this.waitForCanPlay(this.nextAudio);
    
    if (metadata) {
      this.updateMediaSessionMetadata(metadata);
    }
    
    this.metrics.loadEndTime = performance.now();
    this.metrics.loadDuration = this.metrics.loadEndTime - this.metrics.loadStartTime;
    this.metrics.playbackState = 'ready';
    
    this.setupTrackEndHandler();
    
    if (this.onTrackLoad) {
      this.onTrackLoad(trackId, this.nextAudio.duration);
    }
  }

  private waitForCanPlay(audio: HTMLAudioElement, fastStart: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      // [CELLBUG FIX] Use extended timeout on cellular/throttled networks
      const effectiveTimeout = this.isCellular 
        ? CELLULAR_RETRY_CONFIG.timeoutPerAttempt  // 45 seconds
        : this.retryConfig.timeoutPerAttempt;       // 15 seconds
      
      console.log('[AUDIO][STARTUP][LOAD] Waiting for canPlay', {
        timeout: effectiveTimeout,
        isCellular: this.isCellular,
        connectionQuality: this.metrics.connectionQuality,
        fastStart, // [FAST START] Use canplay instead of canplaythrough for faster start
      });
      
      const timeout = setTimeout(() => {
        console.log('[AUDIO][CELLBUG][LOAD] Track load timeout after', effectiveTimeout, 'ms');
        cleanup();
        reject(new Error('Track load timeout'));
      }, effectiveTimeout);
      
      const onCanPlay = () => {
        clearTimeout(timeout);
        cleanup();
        resolve();
      };
      
      const onError = () => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error('Track load error'));
      };
      
      const cleanup = () => {
        // [FAST START] Remove both event listeners regardless of which was used
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('canplaythrough', onCanPlay);
        audio.removeEventListener('error', onError);
      };
      
      // [FAST START] Use 'canplay' for faster start (1-3 seconds of buffer)
      // instead of 'canplaythrough' (full buffer). The HLS ladder will handle
      // quality adaptation if needed. This matches Spotify/YouTube behavior.
      if (fastStart) {
        audio.addEventListener('canplay', onCanPlay, { once: true });
      } else {
        audio.addEventListener('canplaythrough', onCanPlay, { once: true });
      }
      audio.addEventListener('error', onError, { once: true });
      audio.load();
    });
  }

  private waitForHLSReady(hls?: Hls | null): Promise<void> {
    return new Promise((resolve, reject) => {
      // [FIX] Use provided HLS instance or fall back to currentHls
      const hlsInstance = hls || this.currentHls;
      if (!hlsInstance) {
        reject(new Error('HLS not initialized'));
        return;
      }
      
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('HLS load timeout'));
      }, this.retryConfig.timeoutPerAttempt);
      
      const onManifestParsed = () => {
        // Wait a bit more for initial buffering
        setTimeout(() => {
          clearTimeout(timeout);
          cleanup();
          resolve();
        }, 500);
      };
      
      const onError = (event: string, data: any) => {
        if (data.fatal) {
          clearTimeout(timeout);
          cleanup();
          reject(new Error(`HLS error: ${data.details}`));
        }
      };
      
      const cleanup = () => {
        hlsInstance?.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        hlsInstance?.off(Hls.Events.ERROR, onError);
      };
      
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
      hlsInstance.on(Hls.Events.ERROR, onError);
    });
  }

  // [CELLBUG FIX] Track consecutive recovery failures
  private consecutiveStallFailures: number = 0;
  
  // [CELLBUG FIX] Stall recovery for throttled networks
  private startStallRecovery(audio: HTMLAudioElement): void {
    this.cancelStallRecovery();
    
    const timeout = this.isCellular ? this.CELL_STALL_TIMEOUT : this.WIFI_STALL_TIMEOUT;
    const maxAttempts = this.isCellular ? this.CELL_MAX_STALL_RECOVERY : this.WIFI_MAX_STALL_RECOVERY;
    
    console.log('[AUDIO][CELLBUG][STALL] Starting stall recovery timer', {
      timeout,
      maxAttempts,
      currentAttempts: this.stallRecoveryAttempts,
      isCellular: this.isCellular,
      currentTime: audio.currentTime,
    });
    
    this.stallRecoveryTimer = setTimeout(() => {
      this.attemptStallRecovery(audio, maxAttempts);
    }, timeout);
  }
  
  private cancelStallRecovery(): void {
    if (this.stallRecoveryTimer) {
      clearTimeout(this.stallRecoveryTimer);
      this.stallRecoveryTimer = null;
    }
  }
  
  private async attemptStallRecovery(audio: HTMLAudioElement, maxAttempts: number): Promise<void> {
    if (!this.isPlayingState || !audio.paused === false) {
      // Playback resumed on its own or user paused
      console.log('[AUDIO][CELLBUG][STALL] Stall recovery cancelled - playback state changed');
      return;
    }
    
    this.stallRecoveryAttempts++;
    
    console.log('[AUDIO][CELLBUG][STALL] Attempting stall recovery', {
      attempt: this.stallRecoveryAttempts,
      maxAttempts,
      currentTime: audio.currentTime,
      duration: audio.duration,
      readyState: audio.readyState,
      networkState: audio.networkState,
      isCellular: this.isCellular,
    });
    
    // Strategy 1: Micro-seek to trigger rebuffer
    if (this.stallRecoveryAttempts === 1) {
      console.log('[AUDIO][CELLBUG][STALL] Strategy 1: Micro-seek');
      const currentTime = audio.currentTime;
      audio.currentTime = currentTime + 0.1;
      try {
        await audio.play();
        console.log('[AUDIO][CELLBUG][STALL] Strategy 1 succeeded');
        this.stallRecoveryAttempts = 0;
        return;
      } catch (e) {
        console.log('[AUDIO][CELLBUG][STALL] Strategy 1 failed:', e);
      }
    }
    
    // Strategy 2: Reload and resume
    if (this.stallRecoveryAttempts === 2) {
      console.log('[AUDIO][CELLBUG][STALL] Strategy 2: Reload');
      const currentTime = audio.currentTime;
      audio.load();
      try {
        await audio.play();
        audio.currentTime = currentTime;
        console.log('[AUDIO][CELLBUG][STALL] Strategy 2 succeeded');
        this.stallRecoveryAttempts = 0;
        return;
      } catch (e) {
        console.log('[AUDIO][CELLBUG][STALL] Strategy 2 failed:', e);
      }
    }
    
    // Strategy 3 (cellular): HLS restart
    if (this.isCellular && this.stallRecoveryAttempts === 3 && this.currentHls) {
      console.log('[AUDIO][CELLBUG][STALL] Strategy 3: HLS startLoad');
      this.currentHls.startLoad();
      // Wait a bit and check if it recovered
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (!audio.paused) {
        console.log('[AUDIO][CELLBUG][STALL] Strategy 3 succeeded');
        this.stallRecoveryAttempts = 0;
        return;
      }
      console.log('[AUDIO][CELLBUG][STALL] Strategy 3 failed');
    }
    
    // Strategy 4 (cellular): Fresh source reload
    if (this.isCellular && this.stallRecoveryAttempts === 4) {
      console.log('[AUDIO][CELLBUG][STALL] Strategy 4: Fresh source reload');
      const currentSrc = audio.src;
      const currentTime = audio.currentTime;
      
      audio.src = '';
      audio.load();
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!this.isPlayingState) return;
      
      audio.src = currentSrc;
      audio.load();
      try {
        await audio.play();
        audio.currentTime = Math.max(0, currentTime - 1);
        console.log('[AUDIO][CELLBUG][STALL] Strategy 4 succeeded');
        this.stallRecoveryAttempts = 0;
        return;
      } catch (e) {
        console.log('[AUDIO][CELLBUG][STALL] Strategy 4 failed:', e);
      }
    }
    
    // If we haven't exhausted attempts, schedule another recovery
    if (this.stallRecoveryAttempts < maxAttempts) {
      console.log('[AUDIO][CELLBUG][STALL] Scheduling next recovery attempt');
      this.startStallRecovery(audio);
    } else {
      // Exhausted all attempts - but DON'T skip, just log and wait
      // The track will continue to try to play naturally
      console.log('[AUDIO][CELLBUG][STALL] Exhausted recovery attempts - waiting for natural recovery', {
        attempts: this.stallRecoveryAttempts,
        maxAttempts,
      });
      this.metrics.isStalled = true;
      this.metrics.error = 'Playback stalled - waiting for network';
      this.updateMetrics();
      
      // Reset attempts so we can try again if waiting continues
      this.stallRecoveryAttempts = 0;
      
      // Schedule one more check after a longer delay
      setTimeout(() => {
        if (this.isPlayingState && audio.paused && audio === this.currentAudio) {
          console.log('[AUDIO][CELLBUG][STALL] Still stalled after extended wait - retrying recovery');
          this.startStallRecovery(audio);
        }
      }, this.isCellular ? 30000 : 15000);  // 30s for cell, 15s for WiFi
    }
  }
  
  private setupTrackEndHandler(): void {
    // [CELLBUG FIX] Guard against false "ended" events on iOS cellular
    // iOS Safari can fire "ended" prematurely when buffer runs dry during network stalls
    this.nextAudio.onended = () => {
      const audio = this.nextAudio;
      const currentTime = audio.currentTime;
      const duration = audio.duration;
      
      // [CELLBUG FIX] Verify the track actually ended
      // Allow 2 second tolerance for rounding/timing issues
      const trackActuallyEnded = duration > 0 && currentTime >= duration - 2;
      
      console.log('[AUDIO][CELLBUG][ENDED] Track ended event received', {
        currentTime,
        duration,
        trackActuallyEnded,
        isPlayingState: this.isPlayingState,
        isIOS: this.isIOS,
        readyState: audio.readyState,
        networkState: audio.networkState,
        connectionQuality: this.metrics.connectionQuality,
      });
      
      if (!trackActuallyEnded && this.isIOS) {
        // [CELLBUG FIX] This is likely a false "ended" event on iOS
        // Don't skip - instead, try to recover by restarting playback
        console.log('[AUDIO][CELLBUG][ENDED] Detected FALSE ended event - attempting recovery');
        
        this.consecutiveStallFailures++;
        
        // If we've had too many failures, let it skip (true fatal issue)
        if (this.consecutiveStallFailures >= 5) {
          console.log('[AUDIO][CELLBUG][ENDED] Too many consecutive failures, allowing skip');
          this.consecutiveStallFailures = 0;
          if (this.isPlayingState && this.onTrackEnd) {
            this.onTrackEnd();
          }
          return;
        }
        
        // Try to resume playback from where we were
        audio.currentTime = currentTime;
        audio.play().then(() => {
          console.log('[AUDIO][CELLBUG][ENDED] Successfully recovered from false ended event');
          this.consecutiveStallFailures = 0;  // Reset on success
        }).catch((error) => {
          console.log('[AUDIO][CELLBUG][ENDED] Recovery failed:', error);
          // Try reloading the source
          const src = audio.src;
          if (src) {
            audio.src = src;
            audio.load();
            audio.currentTime = currentTime;
            audio.play().catch((e) => {
              console.log('[AUDIO][CELLBUG][ENDED] Second recovery attempt failed:', e);
              // At this point, let the natural flow continue
              // The stall/waiting events will trigger other recovery mechanisms
            });
          }
        });
        
        return;  // Don't call onTrackEnd for false ended events
      }
      
      if (this.isPlayingState && this.onTrackEnd) {
        console.log('[AUDIO][CELLBUG][ENDED] Track genuinely ended, advancing to next');
        this.consecutiveStallFailures = 0;  // Reset on successful track completion
        this.onTrackEnd();
      }
    };
  }

  async play(): Promise<void> {
    // [FAST START] Track when play was requested
    if (this.startupTimestamps.playRequested === 0) {
      this.startupTimestamps.playRequested = performance.now();
      console.log('[AUDIO][STARTUP][PLAY] Play requested', {
        nextAudioHasSrc: !!this.nextAudio.src,
        currentAudioHasSrc: !!this.currentAudio.src,
        currentTrackId: this.currentTrackId,
      });
    }
    
    if (!this.nextAudio.src && !this.currentAudio.src) {
      console.log('[AUDIO][STARTUP][PLAY] No source available, cannot play');
      return;
    }
    
    const hasNewTrack = this.nextAudio.src &&
                        this.nextAudio.src !== this.currentAudio.src &&
                        this.nextAudio !== this.currentAudio;
    
    if (hasNewTrack) {
      await this.crossfadeToNext();
    } else {
      try {
        await this.currentAudio.play();
        this.startupTimestamps.playbackStarted = performance.now();
        this.isPlayingState = true;
        this.metrics.playbackState = 'playing';
        
        // [FAST START] Log play latency
        const playLatency = this.startupTimestamps.playRequested > 0
          ? Math.round(this.startupTimestamps.playbackStarted - this.startupTimestamps.playRequested)
          : 0;
        console.log('[AUDIO][STARTUP][PLAYING] Playback started', {
          playLatencyMs: playLatency,
          readyState: this.currentAudio.readyState,
          currentTime: this.currentAudio.currentTime,
        });
        
        this.updateMetrics();
      } catch (error) {
        console.warn('[AUDIO][STARTUP][PLAY] Play failed:', error);
        throw error;
      }
    }
  }

  private async crossfadeToNext(): Promise<void> {
    // [PREFETCH FIX] Clean up prefetch listeners before switching audio elements
    // The newAudio element might have prefetch listeners that would interfere
    this.cleanupPrefetchListeners();
    
    const oldAudio = this.currentAudio;
    const newAudio = this.nextAudio;
    const oldHls = this.currentHls;
    const newHls = oldAudio === this.primaryAudio ? this.secondaryHls : this.primaryHls;

    const hasOldTrack = oldAudio.src && oldAudio.duration > 0;
    
    if (!hasOldTrack || !this.enableCrossfade) {
      if (hasOldTrack) {
        // [CLICK FIX] Quick micro-fade before stopping old audio
        await this.microFadeOut(oldAudio);
        oldAudio.pause();
        oldAudio.currentTime = 0;
        oldAudio.volume = this.volume; // Restore for reuse
      }
      
      newAudio.volume = this.volume;
      await newAudio.play();
      
      // [FAST START] Track playback start
      this.startupTimestamps.playbackStarted = performance.now();
      if (this.startupTimestamps.playRequested > 0) {
        const playLatency = Math.round(this.startupTimestamps.playbackStarted - this.startupTimestamps.playRequested);
        console.log('[AUDIO][STARTUP][CROSSFADE] Direct start playback began', {
          playLatencyMs: playLatency,
        });
      }
      
      this.currentAudio = newAudio;
      this.nextAudio = oldAudio;
      this.currentHls = newHls;
      this.isPlayingState = true;
      this.metrics.playbackState = 'playing';
      
      this.updateMetrics();
      return;
    }
    
    // Crossfade
    newAudio.volume = 0;
    await newAudio.play();
    this.isPlayingState = true;
    this.metrics.playbackState = 'playing';
    
    const fadeInterval = 50;
    const steps = this.crossfadeDuration / fadeInterval;
    let step = 0;
    
    const fade = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      oldAudio.volume = this.volume * (1 - eased);
      newAudio.volume = this.volume * eased;
      
      if (progress >= 1) {
        clearInterval(fade);
        oldAudio.pause();
        oldAudio.currentTime = 0;
        oldAudio.src = '';
        
        this.currentAudio = newAudio;
        this.nextAudio = oldAudio;
        this.currentHls = newHls;
        
        this.updateMetrics();
      }
    }, fadeInterval);
  }

  pause(): void {
    // [CLICK FIX] Quick micro-fade to prevent click/pop sound
    // The click happens when audio is cut mid-waveform
    this.microFadeOut(this.currentAudio).then(() => {
      this.currentAudio.pause();
      // Restore volume for next play
      this.currentAudio.volume = this.volume;
    });
    this.isPlayingState = false;
    this.metrics.playbackState = 'paused';
    this.updateMetrics();
  }

  stop(): void {
    // [CLICK FIX] Quick micro-fade to prevent click/pop sound
    this.microFadeOut(this.currentAudio).then(() => {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      // Restore volume for next play
      this.currentAudio.volume = this.volume;
    });
    this.isPlayingState = false;
    this.metrics.playbackState = 'stopped';
    this.updateMetrics();
  }
  
  /**
   * [CLICK FIX] Quick micro-fade to prevent audio click/pop when stopping
   * Fades volume to 0 over ~10ms before actually stopping
   */
  private microFadeOut(audio: HTMLAudioElement): Promise<void> {
    return new Promise((resolve) => {
      const startVolume = audio.volume;
      if (startVolume === 0 || audio.paused) {
        resolve();
        return;
      }
      
      const fadeTime = 15; // 15ms micro-fade
      const steps = 3;     // 3 steps = 5ms each
      const stepTime = fadeTime / steps;
      const volumeStep = startVolume / steps;
      let currentStep = 0;
      
      const fadeInterval = setInterval(() => {
        currentStep++;
        audio.volume = Math.max(0, startVolume - (volumeStep * currentStep));
        
        if (currentStep >= steps) {
          clearInterval(fadeInterval);
          audio.volume = 0;
          resolve();
        }
      }, stepTime);
    });
  }

  seek(time: number): void {
    if (this.currentAudio.duration) {
      this.currentAudio.currentTime = Math.max(0, Math.min(time, this.currentAudio.duration));
      this.updateMetrics();
    }
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    this.currentAudio.volume = this.volume;
    this.updateMetrics();
  }

  getVolume(): number {
    return this.volume;
  }

  getCurrentTime(): number {
    return this.currentAudio.currentTime;
  }

  getDuration(): number {
    return this.currentAudio.duration || 0;
  }

  isPlaying(): boolean {
    return this.isPlayingState && !this.currentAudio.paused;
  }

  getMetrics(): AudioMetrics {
    return { ...this.metrics };
  }

  /**
   * [FAST START] Reset startup timestamps for a new playback cycle
   */
  private resetStartupTimestamps(): void {
    this.startupTimestamps = {
      playRequested: 0,
      sourceSet: 0,
      hlsManifestLoaded: 0,
      canPlayFired: 0,
      firstTimeupdateFired: 0,
      playbackStarted: 0,
    };
    this.isFirstTimeupdate = true;
  }

  prefetchNextTrack(trackId: string, filePath: string): void {
    if (this.nextTrackId === trackId) {
      return;
    }
    
    console.log('[AUDIO][STARTUP][NEXT] Prefetching next track', { trackId });
    
    // [PREFETCH FIX] Clear previous prefetch listeners
    this.cleanupPrefetchListeners();
    
    this.nextTrackId = trackId;
    const prefetchAudio = this.currentAudio === this.primaryAudio 
      ? this.secondaryAudio 
      : this.primaryAudio;
    
    // [PREFETCH FIX] Reset prefetch metrics
    this.metrics.prefetchProgress = 0;
    this.metrics.prefetchReadyState = 0;
    this.metrics.prefetchedTrackId = trackId;
    this.updateMetrics();
    
    // Check if HLS is available and use HLS URL if supported
    const hlsAdapter = this.storageAdapter as HLSStorageAdapter;
    const canUseHLS = this.useNativeHLS || this.useHLSJS;
    
    const getPrefetchUrl = async (): Promise<string> => {
      if (canUseHLS && hlsAdapter.hasHLSSupport) {
        const hasHLS = await hlsAdapter.hasHLSSupport(trackId);
        if (hasHLS) {
          return hlsAdapter.getHLSUrl(trackId, `${trackId}/master.m3u8`);
        }
      }
      // Fall back to MP3
      return this.storageAdapter.getAudioUrl(filePath);
    };
    
    getPrefetchUrl().then(url => {
      // [PREFETCH FIX] Set up progress tracking listeners
      this.setupPrefetchListeners(prefetchAudio, trackId);
      
      prefetchAudio.src = url;
      prefetchAudio.preload = 'auto';
      prefetchAudio.load();
      
      this.prefetchedNextTrack = true;
      this.metrics.prefetchedTrackUrl = url;
      this.updateMetrics();
      
      console.log('[AUDIO][STARTUP][NEXT] Next track prefetch initiated', { 
        trackId, 
        url: url.substring(0, 100) + '...' 
      });
    }).catch(err => {
      console.warn('[AUDIO][STARTUP][NEXT] Prefetch URL fetch failed:', err);
      this.metrics.prefetchedTrackId = null;
      this.metrics.prefetchedTrackUrl = null;
      this.updateMetrics();
    });
  }
  
  // [PREFETCH FIX] Listeners for tracking prefetch progress
  private prefetchProgressHandler: (() => void) | null = null;
  private prefetchCanPlayHandler: (() => void) | null = null;
  private prefetchErrorHandler: (() => void) | null = null;
  private prefetchAudioElement: HTMLAudioElement | null = null;
  
  private setupPrefetchListeners(audio: HTMLAudioElement, trackId: string): void {
    this.prefetchAudioElement = audio;
    
    // Progress handler - updates as data is buffered
    this.prefetchProgressHandler = () => {
      if (audio.buffered.length > 0 && audio.duration > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        this.metrics.prefetchProgress = bufferedEnd / audio.duration;
      }
      this.metrics.prefetchReadyState = audio.readyState;
      this.updateMetrics();
    };
    
    // Can play handler - track is ready for playback
    this.prefetchCanPlayHandler = () => {
      console.log('[AUDIO][STARTUP][NEXT] Prefetch ready for playback', { 
        trackId, 
        readyState: audio.readyState,
        duration: audio.duration,
      });
      this.metrics.prefetchReadyState = audio.readyState;
      // Set progress to 100% when canplay fires (enough buffered to start)
      if (audio.duration > 0 && audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        this.metrics.prefetchProgress = bufferedEnd / audio.duration;
      } else {
        this.metrics.prefetchProgress = 1; // Assume ready
      }
      this.updateMetrics();
    };
    
    // Error handler
    this.prefetchErrorHandler = () => {
      console.warn('[AUDIO][STARTUP][NEXT] Prefetch failed', { trackId });
      this.metrics.prefetchProgress = 0;
      this.metrics.prefetchReadyState = 0;
      this.updateMetrics();
    };
    
    audio.addEventListener('progress', this.prefetchProgressHandler);
    audio.addEventListener('canplay', this.prefetchCanPlayHandler);
    audio.addEventListener('canplaythrough', this.prefetchCanPlayHandler);
    audio.addEventListener('loadedmetadata', this.prefetchProgressHandler);
    audio.addEventListener('error', this.prefetchErrorHandler);
  }
  
  private cleanupPrefetchListeners(): void {
    if (this.prefetchAudioElement) {
      if (this.prefetchProgressHandler) {
        this.prefetchAudioElement.removeEventListener('progress', this.prefetchProgressHandler);
        this.prefetchAudioElement.removeEventListener('loadedmetadata', this.prefetchProgressHandler);
      }
      if (this.prefetchCanPlayHandler) {
        this.prefetchAudioElement.removeEventListener('canplay', this.prefetchCanPlayHandler);
        this.prefetchAudioElement.removeEventListener('canplaythrough', this.prefetchCanPlayHandler);
      }
      if (this.prefetchErrorHandler) {
        this.prefetchAudioElement.removeEventListener('error', this.prefetchErrorHandler);
      }
    }
    this.prefetchProgressHandler = null;
    this.prefetchCanPlayHandler = null;
    this.prefetchErrorHandler = null;
    this.prefetchAudioElement = null;
  }

  destroy(): void {
    // Stop metrics loop
    if (this.metricsUpdateFrame) {
      cancelAnimationFrame(this.metricsUpdateFrame);
    }

    // Clear timers
    if (this.stallDetectionTimer) clearTimeout(this.stallDetectionTimer);
    if (this.circuitBreakerTimer) clearTimeout(this.circuitBreakerTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.cancelStallRecovery();  // [CELLBUG FIX] Clean up stall recovery timer
    
    // [PREFETCH FIX] Clean up prefetch listeners
    this.cleanupPrefetchListeners();

    // Abort any pending operations
    if (this.abortController) {
      this.abortController.abort();
    }

    // Stop playback
    this.stop();
    
    // Destroy HLS instances
    if (this.primaryHls) {
      this.primaryHls.destroy();
    }
    if (this.secondaryHls) {
      this.secondaryHls.destroy();
    }
    
    // Clean up audio elements
    this.primaryAudio.src = '';
    this.secondaryAudio.src = '';
    
    if (this.primaryAudio.parentNode) {
      this.primaryAudio.parentNode.removeChild(this.primaryAudio);
    }
    if (this.secondaryAudio.parentNode) {
      this.secondaryAudio.parentNode.removeChild(this.secondaryAudio);
    }
    
    // Clear MediaSession
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    }
  }
}
