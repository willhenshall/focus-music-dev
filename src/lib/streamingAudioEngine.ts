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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if browser supports native HLS (Safari, iOS)
 */
function supportsNativeHLS(): boolean {
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
  
  // Feature detection
  private useNativeHLS: boolean;
  private useHLSJS: boolean;
  private isIOS: boolean;

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
    };
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
    
    audio.addEventListener('loadedmetadata', () => {
      this.updateMetrics();
    });
    
    audio.addEventListener('progress', () => {
      this.updateMetrics();
      this.updateConnectionQuality();
    });
    
    audio.addEventListener('timeupdate', () => {
      this.updateMetrics();
    });
    
    audio.addEventListener('waiting', () => {
      this.metrics.isWaiting = true;
      this.metrics.playbackState = 'buffering';
      this.updateMetrics();
    });
    
    audio.addEventListener('playing', () => {
      this.metrics.isWaiting = false;
      this.metrics.isStalled = false;
      this.metrics.playbackState = 'playing';
      if (audio === this.currentAudio) {
        this.metrics.error = null;
        this.metrics.errorCategory = null;
        this.metrics.retryAttempt = 0;
      }
      this.updateMetrics();
    });
    
    audio.addEventListener('stalled', () => {
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
    const hls = new Hls({
      maxBufferLength: this.hlsConfig.maxBufferLength,
      maxMaxBufferLength: this.hlsConfig.maxMaxBufferLength,
      maxBufferSize: this.hlsConfig.maxBufferSize,
      maxBufferHole: this.hlsConfig.maxBufferHole,
      lowLatencyMode: this.hlsConfig.lowLatencyMode,
      startLevel: this.hlsConfig.startLevel,
      abrEwmaDefaultEstimate: this.hlsConfig.abrEwmaDefaultEstimate,
      // Additional optimizations for audio
      enableWorker: true,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 6,
      levelLoadingTimeOut: 10000,
      manifestLoadingTimeOut: 10000,
    });
    
    // Attach to audio element
    hls.attachMedia(audio);
    
    // HLS event handlers
    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log('[HLS] Manifest parsed, levels:', data.levels.length);
      this.hlsMetrics.levels = data.levels.map((level, index) => ({
        index,
        bitrate: level.bitrate,
        width: level.width,
        height: level.height,
        codecSet: level.codecSet,
      }));
      this.updateMetrics();
    });
    
    hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      console.log('[HLS] Level switched to:', data.level);
      this.hlsMetrics.currentLevel = data.level;
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
      console.error('[HLS] Error:', data.type, data.details);
      
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('[HLS] Fatal network error, trying to recover');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('[HLS] Fatal media error, trying to recover');
            hls.recoverMediaError();
            break;
          default:
            console.error('[HLS] Unrecoverable error');
            this.metrics.error = `HLS Error: ${data.details}`;
            this.metrics.errorCategory = 'hls';
            if (this.onError) {
              this.onError(new Error(data.details), 'hls', false);
            }
            break;
        }
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
      this.metrics.isOnline = true;
      this.metrics.connectionQuality = 'good';
      this.resetCircuitBreaker();
      this.updateMetrics();
    });
    
    window.addEventListener('offline', () => {
      this.metrics.isOnline = false;
      this.metrics.connectionQuality = 'offline';
      this.updateMetrics();
      if (this.isPlayingState) {
        this.pause();
      }
    });
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isPlayingState && this.currentAudio.paused) {
        console.log('[STREAMING ENGINE] Resuming after visibility change');
        this.currentAudio.play().catch(console.warn);
      }
    });
    
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection?.addEventListener('change', () => {
        this.updateConnectionQuality();
      });
    }
  }

  private updateConnectionQuality(): void {
    if (!navigator.onLine) {
      this.metrics.connectionQuality = 'offline';
      return;
    }
    
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      const effectiveType = connection?.effectiveType;
      
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
      this.hlsMetrics.bandwidthEstimate = this.currentHls.bandwidthEstimate || 0;
      this.metrics.estimatedBandwidth = Math.floor(this.hlsMetrics.bandwidthEstimate / 1000);
    }
    
    // Include HLS metrics in main metrics
    this.metrics.hls = { ...this.hlsMetrics };
    
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
    
    this.metrics.loadStartTime = performance.now();
    this.metrics.playbackState = 'loading';
    this.metrics.error = null;
    this.metrics.errorCategory = null;
    this.metrics.retryAttempt = 0;
    this.metrics.recoveryAttempts = 0;
    this.currentTrackId = trackId;
    
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    
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
    } else if (this.currentHls) {
      // hls.js
      this.hlsMetrics.isNativeHLS = false;
      this.currentHls.loadSource(hlsUrl);
      await this.waitForHLSReady();
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

  private waitForCanPlay(audio: HTMLAudioElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Track load timeout'));
      }, this.retryConfig.timeoutPerAttempt);
      
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
        audio.removeEventListener('canplaythrough', onCanPlay);
        audio.removeEventListener('error', onError);
      };
      
      audio.addEventListener('canplaythrough', onCanPlay, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.load();
    });
  }

  private waitForHLSReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.currentHls) {
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
        this.currentHls?.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        this.currentHls?.off(Hls.Events.ERROR, onError);
      };
      
      this.currentHls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
      this.currentHls.on(Hls.Events.ERROR, onError);
    });
  }

  private setupTrackEndHandler(): void {
    this.nextAudio.onended = () => {
      if (this.isPlayingState && this.onTrackEnd) {
        this.onTrackEnd();
      }
    };
  }

  async play(): Promise<void> {
    if (!this.nextAudio.src && !this.currentAudio.src) {
      return;
    }
    
    const hasNewTrack = this.nextAudio.src &&
                        this.nextAudio.src !== this.currentAudio.src &&
                        this.nextAudio !== this.currentAudio;
    
    if (hasNewTrack) {
      await this.crossfadeToNext();
    } else {
      await this.currentAudio.play();
      this.isPlayingState = true;
      this.metrics.playbackState = 'playing';
      this.updateMetrics();
    }
  }

  private async crossfadeToNext(): Promise<void> {
    const oldAudio = this.currentAudio;
    const newAudio = this.nextAudio;
    const oldHls = this.currentHls;
    const newHls = oldAudio === this.primaryAudio ? this.secondaryHls : this.primaryHls;
    
    const hasOldTrack = oldAudio.src && oldAudio.duration > 0;
    
    if (!hasOldTrack || !this.enableCrossfade) {
      if (hasOldTrack) {
        oldAudio.pause();
        oldAudio.currentTime = 0;
      }
      
      newAudio.volume = this.volume;
      await newAudio.play();
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
    this.currentAudio.pause();
    this.isPlayingState = false;
    this.metrics.playbackState = 'paused';
    this.updateMetrics();
  }

  stop(): void {
    this.currentAudio.pause();
    this.currentAudio.currentTime = 0;
    this.isPlayingState = false;
    this.metrics.playbackState = 'stopped';
    this.updateMetrics();
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

  prefetchNextTrack(trackId: string, filePath: string): void {
    if (this.nextTrackId === trackId) {
      return;
    }
    
    this.nextTrackId = trackId;
    const prefetchAudio = this.currentAudio === this.primaryAudio 
      ? this.secondaryAudio 
      : this.primaryAudio;
    
    // For HLS, preload is handled differently
    this.storageAdapter.getAudioUrl(filePath).then(url => {
      prefetchAudio.src = url;
      prefetchAudio.preload = 'auto';
      prefetchAudio.load();
      
      this.prefetchedNextTrack = true;
      this.metrics.prefetchedTrackId = trackId;
      this.metrics.prefetchedTrackUrl = url;
      this.updateMetrics();
    }).catch(console.warn);
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
