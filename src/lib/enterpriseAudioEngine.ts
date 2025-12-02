/**
 * Enterprise-Grade HTML5 Audio Engine
 * Built for 99.9% uptime with global user base
 *
 * Features:
 * - Automatic retry with exponential backoff (5 attempts)
 * - Jittered backoff to prevent thundering herd
 * - Circuit breaker pattern for cascading failure prevention
 * - Online/offline network monitoring
 * - Connection quality detection
 * - Adaptive buffering based on bandwidth
 * - Stall recovery with progressive strategies
 * - CDN-ready with flexible storage adapters
 * - Comprehensive error categorization
 * - Dual audio element architecture for gapless playback
 * - MediaSession API for lock screen controls
 * - iOS WebKit buffer governor for long track stability
 */

import { 
  getIosBufferGovernor, 
  IosBufferGovernor,
  BufferGovernorState,
  BUFFER_GOVERNOR_CONFIG,
} from './iosBufferGovernor';
import { getIosWebkitInfo, IosWebkitInfo } from './iosWebkitDetection';

export type ErrorCategory = 'network' | 'decode' | 'auth' | 'cors' | 'timeout' | 'ios_webkit_buffer' | 'unknown';

export interface AudioMetrics {
  currentTrackId: string | null;
  currentTrackUrl: string | null;
  storageBackend: string;
  loadStartTime: number;
  loadEndTime: number;
  loadDuration: number;
  networkState: number;
  networkStateLabel: string;
  readyState: number;
  readyStateLabel: string;
  playbackState: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';
  currentTime: number;
  duration: number;
  buffered: number;
  bufferPercentage: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  error: string | null;
  errorCategory: ErrorCategory | null;
  isStalled: boolean;
  isWaiting: boolean;
  canPlayThrough: boolean;
  mediaSessionActive: boolean;
  audioElement: 'primary' | 'secondary' | null;
  prefetchedTrackId: string | null;
  prefetchedTrackUrl: string | null;
  prefetchProgress: number;
  prefetchReadyState: number;
  estimatedBandwidth: number;
  bytesLoaded: number;
  totalBytes: number;
  downloadSpeed: number;
  isOnline: boolean;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
  retryAttempt: number;
  maxRetries: number;
  nextRetryIn: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  sessionSuccessRate: number;
  stallCount: number;
  recoveryAttempts: number;
  // iOS WebKit Buffer Governor metrics
  iosWebkit: {
    isIOSWebKit: boolean;
    browserName: string;
    isCellular: boolean;
    bufferGovernorActive: boolean;
    bufferLimitBytes: number;
    estimatedBufferedBytes: number;
    isLargeTrack: boolean;
    isThrottling: boolean;
    recoveryAttempts: number;
    recoveryErrorType: string | null;
    prefetchAllowed: boolean;
    prefetchReason: string;
  };
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  timeoutPerAttempt: number;
  overallTimeout: number;
  jitterFactor: number;
}

export interface StorageAdapter {
  name: string;
  getAudioUrl(filePath: string): Promise<string>;
  validateUrl(url: string): boolean;
  getRegionalEndpoint?(region: string): string;
}

type TrackLoadCallback = (trackId: string, duration: number) => void;
type TrackEndCallback = () => void;
type DiagnosticsUpdateCallback = (metrics: AudioMetrics) => void;
type ErrorCallback = (error: Error, category: ErrorCategory, canRetry: boolean) => void;

/**
 * Format seconds into MM:SS display string
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export class EnterpriseAudioEngine {
  private primaryAudio: HTMLAudioElement;
  private secondaryAudio: HTMLAudioElement;
  private currentAudio: HTMLAudioElement;
  private nextAudio: HTMLAudioElement;
  private currentTrackId: string | null = null;
  private nextTrackId: string | null = null;
  private volume: number = 0.7;
  private isPlayingState: boolean = false;
  private crossfadeDuration: number = 1000;
  private enableCrossfade: boolean = true;
  private prefetchedNextTrack: boolean = false;
  private storageAdapter: StorageAdapter;

  private onTrackLoad: TrackLoadCallback | null = null;
  private onTrackEnd: TrackEndCallback | null = null;
  private onDiagnosticsUpdate: DiagnosticsUpdateCallback | null = null;
  private onError: ErrorCallback | null = null;

  private retryConfig: RetryConfig = {
    maxAttempts: 5,
    baseDelay: 500,
    maxDelay: 8000,
    timeoutPerAttempt: 15000,
    overallTimeout: 45000,
    jitterFactor: 0.3,
  };

  private metrics: AudioMetrics = {
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
    iosWebkit: {
      isIOSWebKit: false,
      browserName: 'Unknown',
      isCellular: false,
      bufferGovernorActive: false,
      bufferLimitBytes: 0,
      estimatedBufferedBytes: 0,
      isLargeTrack: false,
      isThrottling: false,
      recoveryAttempts: 0,
      recoveryErrorType: null,
      prefetchAllowed: true,
      prefetchReason: 'nonIOSPlatform',
    },
  };

  private metricsUpdateFrame: number | null = null;
  private lastBytesLoaded: number = 0;
  private lastBandwidthCheck: number = 0;
  private bandwidthSamples: number[] = [];
  private circuitBreakerFailures: number = 0;
  private circuitBreakerThreshold: number = 5;
  private circuitBreakerResetTime: number = 30000;
  private circuitBreakerTimer: NodeJS.Timeout | null = null;
  private stallDetectionTimer: NodeJS.Timeout | null = null;
  private stallDetectionDelay: number = 5000;
  private retryTimer: NodeJS.Timeout | null = null;
  private abortController: AbortController | null = null;
  
  // iOS WebKit Buffer Governor
  private bufferGovernor: IosBufferGovernor;
  private iosWebkitInfo: IosWebkitInfo;

  constructor(storageAdapter: StorageAdapter) {
    this.storageAdapter = storageAdapter;
    this.metrics.storageBackend = storageAdapter.name;

    // Initialize iOS WebKit detection and buffer governor
    this.iosWebkitInfo = getIosWebkitInfo();
    this.bufferGovernor = getIosBufferGovernor();
    
    // Set up buffer governor callbacks
    this.bufferGovernor.setCallbacks({
      onRecoveryNeeded: (position) => this.handleBufferRecovery(position),
      onRecoveryExhausted: () => this.handleBufferRecoveryExhausted(),
      onThrottleStart: () => {
        console.log('[IOS_BUFFER] Throttling started - disabling prefetch');
      },
      onThrottleEnd: () => {
        console.log('[IOS_BUFFER] Throttling ended - prefetch may resume');
      },
    });

    // Initialize iOS WebKit metrics
    this.updateIosWebkitMetrics();

    if (this.iosWebkitInfo.isIOSWebKit) {
      console.log('[IOS_BUFFER] iOS WebKit detected - buffer governor active', {
        browser: this.iosWebkitInfo.browserName,
        cellular: this.iosWebkitInfo.isCellular,
        version: this.iosWebkitInfo.iosVersion,
      });
    }

    this.primaryAudio = this.createAudioElement();
    this.secondaryAudio = this.createAudioElement();
    this.currentAudio = this.primaryAudio;
    this.nextAudio = this.secondaryAudio;

    this.primaryAudio.volume = this.volume;
    this.secondaryAudio.volume = 0;

    this.setupNetworkMonitoring();
    this.startMetricsLoop();
    this.initializeMediaSession();
    this.exposeDebugInterface();
  }

  private createAudioElement(): HTMLAudioElement {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.setAttribute('playsinline', 'true');
    audio.style.display = 'none';
    document.body.appendChild(audio);

    // Apply iOS WebKit buffer governor configuration
    // This may change preload to 'metadata' on iOS to prevent aggressive buffering
    this.bufferGovernor.configureAudioElement(audio);

    audio.addEventListener('canplaythrough', () => {
      this.metrics.error = null;
      this.metrics.errorCategory = null;
      this.updateMetrics();
    });

    audio.addEventListener('loadedmetadata', () => {
      this.updateMetrics();
    });

    audio.addEventListener('loadeddata', () => {
      this.updateMetrics();
    });

    audio.addEventListener('progress', () => {
      this.updateMetrics();
      this.updateConnectionQuality();
    });

    audio.addEventListener('timeupdate', () => {
      this.updateMetrics();
      this.resetStallDetection();
    });

    audio.addEventListener('waiting', () => {
      this.metrics.isWaiting = true;
      this.updateMetrics();
      this.startStallDetection();
    });

    audio.addEventListener('playing', () => {
      this.metrics.isWaiting = false;
      this.metrics.isStalled = false;
      // Only clear errors if this is the current audio element
      if (audio === this.currentAudio) {
        this.metrics.error = null;
        this.metrics.errorCategory = null;
        this.metrics.retryAttempt = 0;
      }
      this.updateMetrics();
      this.resetStallDetection();
    });

    audio.addEventListener('stalled', () => {
      this.metrics.isStalled = true;
      this.metrics.stallCount++;
      this.updateMetrics();
      this.attemptStallRecovery();
    });

    audio.addEventListener('error', (e) => {
      const error = audio.error;
      // Only track errors from the current audio element, ignore prefetch errors
      if (error && audio === this.currentAudio) {
        const { message, category } = this.categorizeError(error);
        this.metrics.error = message;
        this.metrics.errorCategory = category;
        this.updateMetrics();
        
        // Check if buffer governor should handle this error
        if (this.bufferGovernor.handleError(error, audio.networkState)) {
          console.log('[IOS_BUFFER] Buffer-related error detected, attempting recovery');
          this.bufferGovernor.attemptRecovery();
        }
      }
    });

    return audio;
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

    // Handle page visibility changes (tab switching)
    // This prevents audio from restarting when returning to the tab
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('[PAGE VISIBILITY] Tab hidden - maintaining audio state');
        // Tab is hidden - audio will continue playing in background
        // Safari may throttle/suspend, but we DON'T change our state
      } else {
        console.log('[PAGE VISIBILITY] Tab visible - checking audio state:', {
          isPlayingState: this.isPlayingState,
          audioPaused: this.currentAudio.paused,
          currentSrc: this.currentAudio.src
        });
        // Tab is visible again - if we SHOULD be playing but audio got suspended, resume it
        if (this.isPlayingState && this.currentAudio.paused && this.currentAudio.src) {
          console.log('[PAGE VISIBILITY] Resuming audio after tab switch');
          this.currentAudio.play().catch(err => {
            console.warn('[PAGE VISIBILITY] Failed to resume:', err);
          });
        }
        // DO NOT reload track, DO NOT change state, just resume if needed
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
          if (this.metrics.estimatedBandwidth > 1000) {
            this.metrics.connectionQuality = 'excellent';
          } else if (this.metrics.estimatedBandwidth > 500) {
            this.metrics.connectionQuality = 'good';
          } else if (this.metrics.estimatedBandwidth > 200) {
            this.metrics.connectionQuality = 'fair';
          } else {
            this.metrics.connectionQuality = 'poor';
          }
      }
    }
  }

  private startStallDetection(): void {
    this.resetStallDetection();
    this.stallDetectionTimer = setTimeout(() => {
      if (this.isPlayingState && this.currentAudio.paused) {
        this.metrics.isStalled = true;
        this.metrics.stallCount++;
        this.updateMetrics();
        this.attemptStallRecovery();
      }
    }, this.stallDetectionDelay);
  }

  private resetStallDetection(): void {
    if (this.stallDetectionTimer) {
      clearTimeout(this.stallDetectionTimer);
      this.stallDetectionTimer = null;
    }
  }

  private async attemptStallRecovery(): Promise<void> {
    if (!this.isPlayingState) return;

    this.metrics.recoveryAttempts++;
    this.updateMetrics();

    if (this.metrics.recoveryAttempts === 1) {
      const currentTime = this.currentAudio.currentTime;
      this.currentAudio.currentTime = currentTime + 0.1;

      try {
        await this.currentAudio.play();
        this.metrics.isStalled = false;
        this.updateMetrics();
        return;
      } catch (error) {
        // Continue to next recovery strategy
      }
    }

    if (this.metrics.recoveryAttempts === 2) {
      this.currentAudio.load();
      const currentTime = this.currentAudio.currentTime;

      try {
        await this.currentAudio.play();
        this.currentAudio.currentTime = currentTime;
        this.metrics.isStalled = false;
        this.updateMetrics();
        return;
      } catch (error) {
        // Continue to next recovery strategy
      }
    }

    if (this.metrics.recoveryAttempts >= 3) {
      this.metrics.error = 'Playback stalled - skipping to next track';
      this.metrics.errorCategory = 'network';
      this.updateMetrics();

      if (this.onTrackEnd) {
        this.onTrackEnd();
      }
    }
  }

  private categorizeError(error: MediaError): { message: string; category: ErrorCategory } {
    let message = 'Unknown error';
    let category: ErrorCategory = 'unknown';

    switch (error.code) {
      case error.MEDIA_ERR_ABORTED:
        message = 'Playback aborted by user';
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

    if (error.message?.includes('CORS')) {
      category = 'cors';
      message = 'CORS error - check CDN configuration';
    } else if (error.message?.includes('403') || error.message?.includes('401')) {
      category = 'auth';
      message = 'Authentication error loading media';
    }

    return { message, category };
  }

  private isRetriableError(category: ErrorCategory): boolean {
    return category === 'network' || category === 'timeout' || category === 'unknown';
  }

  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    );

    const jitter = exponentialDelay * this.retryConfig.jitterFactor * (Math.random() - 0.5);

    return Math.floor(exponentialDelay + jitter);
  }

  private isCircuitBreakerOpen(): boolean {
    return this.metrics.circuitBreakerState === 'open';
  }

  private recordFailure(): void {
    this.circuitBreakerFailures++;
    this.metrics.failureCount++;
    this.updateSessionSuccessRate();

    if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
      this.openCircuitBreaker();
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

  private initializeMediaSession(): void {
    if ('mediaSession' in navigator) {
      this.metrics.mediaSessionActive = true;

      navigator.mediaSession.setActionHandler('play', () => {
        console.log('[DIAGNOSTIC] MediaSession play handler triggered');
        this.play();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        console.log('[DIAGNOSTIC] MediaSession pause handler triggered');
        this.pause();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        console.log('[DIAGNOSTIC] MediaSession nexttrack handler triggered');
        if (this.onTrackEnd) {
          this.onTrackEnd();
        }
      });

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        console.log('[DIAGNOSTIC] MediaSession seekto handler triggered:', details.seekTime);
        if (details.seekTime !== undefined) {
          this.seek(details.seekTime);
        }
      });
    }
  }

  private updateMediaSessionMetadata(trackName?: string, artistName?: string): void {
    if ('mediaSession' in navigator && trackName) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: trackName,
        artist: artistName || 'focus.music',
        album: 'Focus Music',
      });
    }
  }

  private getNetworkStateLabel(state: number): string {
    const labels = ['NETWORK_EMPTY', 'NETWORK_IDLE', 'NETWORK_LOADING', 'NETWORK_NO_SOURCE'];
    return labels[state] || 'UNKNOWN';
  }

  private getReadyStateLabel(state: number): string {
    const labels = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];
    return labels[state] || 'UNKNOWN';
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
    this.metrics.networkStateLabel = this.getNetworkStateLabel(audio.networkState);
    this.metrics.readyState = audio.readyState;
    this.metrics.readyStateLabel = this.getReadyStateLabel(audio.readyState);
    this.metrics.currentTime = audio.currentTime;
    this.metrics.duration = audio.duration || 0;
    this.metrics.volume = this.volume;
    this.metrics.muted = audio.muted;
    this.metrics.playbackRate = audio.playbackRate;
    this.metrics.canPlayThrough = audio.readyState >= 4;
    this.metrics.audioElement = audio === this.primaryAudio ? 'primary' : 'secondary';

    if (audio.buffered.length > 0 && audio.duration) {
      const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
      this.metrics.buffered = bufferedEnd;
      this.metrics.bufferPercentage = (bufferedEnd / audio.duration) * 100;

      const estimatedBitrate = 128000;
      this.metrics.bytesLoaded = Math.floor((bufferedEnd * estimatedBitrate) / 8);
      this.metrics.totalBytes = Math.floor((audio.duration * estimatedBitrate) / 8);
    } else {
      this.metrics.buffered = 0;
      this.metrics.bufferPercentage = 0;
      this.metrics.bytesLoaded = 0;
    }

    const now = performance.now();
    if (now - this.lastBandwidthCheck > 2000) {
      const bytesDownloaded = this.metrics.bytesLoaded - this.lastBytesLoaded;
      const timeElapsed = (now - this.lastBandwidthCheck) / 1000;
      const downloadSpeed = bytesDownloaded / timeElapsed;

      if (downloadSpeed > 0) {
        this.bandwidthSamples.push(downloadSpeed);
        if (this.bandwidthSamples.length > 5) {
          this.bandwidthSamples.shift();
        }

        const avgBandwidth = this.bandwidthSamples.reduce((a, b) => a + b, 0) / this.bandwidthSamples.length;
        this.metrics.estimatedBandwidth = Math.floor(avgBandwidth * 8 / 1000);
        this.metrics.downloadSpeed = downloadSpeed;
      }

      this.lastBytesLoaded = this.metrics.bytesLoaded;
      this.lastBandwidthCheck = now;
    }

    // Update iOS WebKit buffer governor metrics
    this.updateIosWebkitMetrics();

    if (this.onDiagnosticsUpdate) {
      this.onDiagnosticsUpdate({ ...this.metrics });
    }
  }

  setCallbacks(callbacks: {
    onTrackLoad?: TrackLoadCallback;
    onTrackEnd?: TrackEndCallback;
    onDiagnosticsUpdate?: DiagnosticsUpdateCallback;
    onError?: ErrorCallback;
  }): void {
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

  prefetchNextTrack(trackId: string, filePath: string): void {
    if (this.nextTrackId === trackId) {
      return;
    }

    // Check if buffer governor allows prefetching
    if (!this.bufferGovernor.canPrefetch()) {
      const state = this.bufferGovernor.getState();
      console.log('[IOS_BUFFER] Prefetch blocked:', state.prefetch.reason);
      return;
    }

    this.nextTrackId = trackId;

    const prefetchAudio = this.currentAudio === this.primaryAudio ? this.secondaryAudio : this.primaryAudio;

    this.storageAdapter.getAudioUrl(filePath).then(url => {
      prefetchAudio.src = url;
      prefetchAudio.load();
      prefetchAudio.preload = 'auto';

      this.prefetchedNextTrack = true;
      this.bufferGovernor.recordPrefetch(trackId);
      this.metrics.prefetchedTrackId = trackId;
      this.metrics.prefetchedTrackUrl = url;

      const onProgress = () => {
        this.metrics.prefetchReadyState = prefetchAudio.readyState;

        if (prefetchAudio.buffered.length > 0 && prefetchAudio.duration > 0) {
          const bufferedEnd = prefetchAudio.buffered.end(prefetchAudio.buffered.length - 1);
          this.metrics.prefetchProgress = (bufferedEnd / prefetchAudio.duration) * 100;
        }

        if (prefetchAudio.readyState >= 3) {
          prefetchAudio.removeEventListener('progress', onProgress);
          prefetchAudio.removeEventListener('canplaythrough', onProgress);
        }
        this.updateMetrics();
      };

      prefetchAudio.addEventListener('progress', onProgress);
      prefetchAudio.addEventListener('canplaythrough', onProgress, { once: true });
    }).catch(error => {
      console.warn('Prefetch failed:', error);
    });
  }

  async loadTrack(trackId: string, filePath: string, metadata?: { trackName?: string; artistName?: string }): Promise<void> {
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker is open - too many recent failures');
    }

    this.metrics.loadStartTime = performance.now();
    this.metrics.playbackState = 'loading';
    this.metrics.error = null;
    this.metrics.errorCategory = null;
    this.metrics.retryAttempt = 0;
    this.metrics.recoveryAttempts = 0;
    this.currentTrackId = trackId;
    
    // Reset buffer governor for new track
    this.bufferGovernor.resetForNewTrack();

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    if (this.prefetchedNextTrack && this.nextTrackId === trackId) {
      return this.loadPrefetchedTrack(trackId, metadata);
    }

    const overallTimeout = setTimeout(() => {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.recordFailure();
    }, this.retryConfig.overallTimeout);

    try {
      const url = await this.storageAdapter.getAudioUrl(filePath);
      this.metrics.currentTrackUrl = url;

      await this.loadTrackWithRetry(trackId, url, metadata);
      clearTimeout(overallTimeout);
      this.recordSuccess();
    } catch (error) {
      clearTimeout(overallTimeout);
      this.recordFailure();
      throw error;
    }
  }

  private async loadPrefetchedTrack(trackId: string, metadata?: { trackName?: string; artistName?: string }): Promise<void> {
    this.prefetchedNextTrack = false;
    this.nextTrackId = null;

    const prefetchedAudio = this.currentAudio === this.primaryAudio ? this.secondaryAudio : this.primaryAudio;

    if (prefetchedAudio.readyState >= 3) {
      this.nextAudio = prefetchedAudio;
      this.metrics.loadEndTime = performance.now();
      this.metrics.loadDuration = this.metrics.loadEndTime - this.metrics.loadStartTime;
      this.metrics.currentTrackId = trackId;
      this.metrics.playbackState = 'ready';

      if (metadata) {
        this.updateMediaSessionMetadata(metadata.trackName, metadata.artistName);
      }

      if (this.onTrackLoad) {
        this.onTrackLoad(trackId, this.nextAudio.duration);
      }

      return Promise.resolve();
    }

    return this.waitForAudioReady(prefetchedAudio, trackId, metadata);
  }

  private async loadTrackWithRetry(trackId: string, url: string, metadata?: { trackName?: string; artistName?: string }): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Load aborted');
      }

      this.metrics.retryAttempt = attempt + 1;
      this.updateMetrics();

      try {
        await this.attemptLoadTrack(url, trackId, metadata, attempt);
        return;
      } catch (error) {
        lastError = error as Error;

        const errorCategory = this.metrics.errorCategory || 'unknown';

        if (!this.isRetriableError(errorCategory)) {
          if (this.onError) {
            this.onError(lastError, errorCategory, false);
          }
          throw lastError;
        }

        if (attempt < this.retryConfig.maxAttempts - 1) {
          const delay = this.calculateBackoffDelay(attempt);
          this.metrics.nextRetryIn = delay;
          this.updateMetrics();

          if (this.onError) {
            this.onError(lastError, errorCategory, true);
          }

          await this.sleep(delay);
        }
      }
    }

    if (lastError) {
      if (this.onError) {
        this.onError(lastError, this.metrics.errorCategory || 'unknown', false);
      }
      throw lastError;
    }
  }

  private async attemptLoadTrack(url: string, trackId: string, metadata?: { trackName?: string; artistName?: string }, attempt?: number): Promise<void> {
    this.nextAudio.src = url;
    this.nextAudio.load();

    if (metadata) {
      this.updateMediaSessionMetadata(metadata.trackName, metadata.artistName);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        this.metrics.error = `Load timeout on attempt ${(attempt || 0) + 1}`;
        this.metrics.errorCategory = 'timeout';
        this.metrics.playbackState = 'idle';
        this.updateMetrics();
        reject(new Error('Track load timeout'));
      }, this.retryConfig.timeoutPerAttempt);

      const onCanPlay = () => {
        clearTimeout(timeout);
        this.metrics.loadEndTime = performance.now();
        this.metrics.loadDuration = this.metrics.loadEndTime - this.metrics.loadStartTime;
        this.metrics.currentTrackId = trackId;
        this.metrics.playbackState = 'ready';
        this.metrics.error = null;
        this.metrics.errorCategory = null;

        cleanup();

        if (this.onTrackLoad) {
          this.onTrackLoad(trackId, this.nextAudio.duration);
        }

        resolve();
      };

      const onError = (e: Event) => {
        clearTimeout(timeout);
        cleanup();

        const errorMsg = this.metrics.error || 'Unknown error loading track';
        this.metrics.playbackState = 'idle';
        this.updateMetrics();

        reject(new Error(`Failed to load track ${trackId}: ${errorMsg}`));
      };

      const cleanup = () => {
        this.nextAudio.removeEventListener('canplaythrough', onCanPlay);
        this.nextAudio.removeEventListener('error', onError);
      };

      this.nextAudio.addEventListener('canplaythrough', onCanPlay, { once: true });
      this.nextAudio.addEventListener('error', onError, { once: true });

      this.nextAudio.onended = () => {
        if (this.isPlayingState && this.onTrackEnd) {
          this.onTrackEnd();
        }
      };
    });
  }

  private async waitForAudioReady(audio: HTMLAudioElement, trackId: string, metadata?: { trackName?: string; artistName?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Prefetched track failed to become ready'));
      }, 10000);

      const onReady = () => {
        clearTimeout(timeout);
        cleanup();

        this.nextAudio = audio;
        this.metrics.loadEndTime = performance.now();
        this.metrics.loadDuration = this.metrics.loadEndTime - this.metrics.loadStartTime;
        this.metrics.currentTrackId = trackId;
        this.metrics.playbackState = 'ready';

        if (metadata) {
          this.updateMediaSessionMetadata(metadata.trackName, metadata.artistName);
        }

        if (this.onTrackLoad) {
          this.onTrackLoad(trackId, this.nextAudio.duration);
        }

        resolve();
      };

      const cleanup = () => {
        audio.removeEventListener('canplaythrough', onReady);
      };

      if (audio.readyState >= 3) {
        onReady();
      } else {
        audio.addEventListener('canplaythrough', onReady, { once: true });
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
      }

      this.retryTimer = setTimeout(() => {
        this.metrics.nextRetryIn = 0;
        this.updateMetrics();
        resolve();
      }, ms);

      const updateCountdown = () => {
        if (this.metrics.nextRetryIn > 100) {
          this.metrics.nextRetryIn -= 100;
          this.updateMetrics();
          setTimeout(updateCountdown, 100);
        }
      };
      setTimeout(updateCountdown, 100);
    });
  }

  async play(): Promise<void> {
    console.log('[DIAGNOSTIC] play() called:', {
      currentSrc: this.currentAudio.src,
      nextSrc: this.nextAudio.src,
      isPlayingState: this.isPlayingState,
      audioPaused: this.currentAudio.paused,
      documentHidden: document.hidden
    });

    if (!this.nextAudio.src && !this.currentAudio.src) {
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
        this.isPlayingState = true;
        this.metrics.playbackState = 'playing';
        this.updateMetrics();
        console.log('[DIAGNOSTIC] play() completed successfully');
        
        // Start buffer governor monitoring
        this.bufferGovernor.startMonitoring(this.currentAudio);
      } catch (error) {
        console.error('[DIAGNOSTIC] play() failed:', error);
        
        // Check if this is a NotSupportedError (iOS WebKit buffer issue)
        if (error instanceof Error && error.message?.includes('NotSupported')) {
          console.log('[IOS_BUFFER] NotSupportedError detected during play()');
          if (this.bufferGovernor.handleError(error, this.currentAudio.networkState)) {
            const recovered = await this.bufferGovernor.attemptRecovery();
            if (recovered) {
              return; // Recovery successful
            }
          }
        }
        
        this.metrics.error = `Play failed: ${error}`;
        this.metrics.errorCategory = 'unknown';
        this.updateMetrics();
        throw error;
      }
    }
  }

  private async crossfadeToNext(): Promise<void> {
    const oldAudio = this.currentAudio;
    const newAudio = this.nextAudio;

    const hasOldTrack = oldAudio.src && oldAudio.duration > 0;

    if (!hasOldTrack || !this.enableCrossfade) {
      if (hasOldTrack) {
        oldAudio.pause();
        oldAudio.currentTime = 0;
      }

      newAudio.volume = this.volume;
      try {
        await newAudio.play();
        this.currentAudio = newAudio;
        this.nextAudio = oldAudio;
        this.isPlayingState = true;
        this.metrics.playbackState = 'playing';
        this.updateMetrics();
      } catch (error) {
        throw error;
      }
      return;
    }

    newAudio.volume = 0;

    try {
      await newAudio.play();
    } catch (error) {
      throw error;
    }

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

        this.updateMetrics();
      }
    }, fadeInterval);
  }

  pause(): void {
    console.log('[DIAGNOSTIC] pause() called:', {
      isPlayingState: this.isPlayingState,
      audioPaused: this.currentAudio.paused,
      documentHidden: document.hidden,
      stackTrace: new Error().stack
    });

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
    this.bufferGovernor.stopMonitoring();
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

  /**
   * Get buffer governor state (for diagnostics).
   */
  getBufferGovernorState(): BufferGovernorState {
    return this.bufferGovernor.getState();
  }

  /**
   * Check if buffer governor is active.
   */
  isBufferGovernorActive(): boolean {
    return this.bufferGovernor.isActive();
  }

  /**
   * Force buffer governor active state for testing.
   * @internal Test hook only
   */
  _forceBufferGovernorActive(active: boolean): void {
    this.bufferGovernor._forceActivate(active);
    this.updateIosWebkitMetrics();
  }

  /**
   * Simulate a buffer failure for testing.
   * @internal Test hook only
   */
  _simulateBufferFailure(): void {
    this.bufferGovernor._simulateBufferFailure();
    this.bufferGovernor.attemptRecovery();
  }

  /**
   * Handle buffer recovery request from governor.
   */
  private async handleBufferRecovery(resumePosition: number): Promise<boolean> {
    if (!this.currentAudio.src || !this.isPlayingState) {
      return false;
    }

    const currentUrl = this.currentAudio.src;

    console.log('[RECOVERY] iOS WebKit buffer recovery, resuming at', resumePosition.toFixed(2) + 's');

    try {
      // Re-set the source to force WebKit to drop and restart the connection
      this.currentAudio.src = currentUrl;
      this.currentAudio.load();

      // Wait for enough data to seek
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('Recovery timeout'));
        }, BUFFER_GOVERNOR_CONFIG.RECOVERY_TIMEOUT_MS);

        const onCanPlay = () => {
          cleanup();
          resolve();
        };

        const onError = () => {
          cleanup();
          reject(new Error('Recovery load failed'));
        };

        const cleanup = () => {
          clearTimeout(timeout);
          this.currentAudio.removeEventListener('canplay', onCanPlay);
          this.currentAudio.removeEventListener('error', onError);
        };

        this.currentAudio.addEventListener('canplay', onCanPlay, { once: true });
        this.currentAudio.addEventListener('error', onError, { once: true });
      });

      // Seek and play
      this.currentAudio.currentTime = resumePosition;
      await this.currentAudio.play();

      // Clear error state
      this.metrics.error = null;
      this.metrics.errorCategory = null;
      this.updateMetrics();

      console.log('[RECOVERY] Successfully resumed at', resumePosition.toFixed(2) + 's');
      return true;

    } catch (error) {
      console.error('[RECOVERY] Buffer recovery failed:', error);
      return false;
    }
  }

  /**
   * Handle when buffer recovery attempts are exhausted.
   */
  private handleBufferRecoveryExhausted(): void {
    console.log('[RECOVERY] iOS WebKit buffer recovery exhausted - skipping track');
    this.metrics.error = 'iOS WebKit buffer failure - skipping track';
    this.metrics.errorCategory = 'ios_webkit_buffer';
    this.updateMetrics();

    if (this.onTrackEnd) {
      this.onTrackEnd();
    }
  }

  /**
   * Update iOS WebKit metrics from buffer governor state.
   */
  private updateIosWebkitMetrics(): void {
    const state = this.bufferGovernor.getState();
    
    this.metrics.iosWebkit = {
      isIOSWebKit: state.iosInfo.isIOSWebKit,
      browserName: state.iosInfo.browserName,
      isCellular: state.iosInfo.isCellular,
      bufferGovernorActive: state.active,
      bufferLimitBytes: state.limitBytes,
      estimatedBufferedBytes: state.estimatedBufferedBytes,
      isLargeTrack: state.isLargeTrack,
      isThrottling: state.isThrottling,
      recoveryAttempts: state.recovery.attempts,
      recoveryErrorType: state.recovery.errorType,
      prefetchAllowed: state.prefetch.allowed,
      prefetchReason: state.prefetch.reason,
    };
  }

  /**
   * Expose debug interface on window for console debugging.
   */
  private exposeDebugInterface(): void {
    if (typeof window !== 'undefined') {
      (window as any).__playerDebug = {
        getMetrics: () => this.getMetrics(),
        getBufferGovernorState: () => this.getBufferGovernorState(),
        isIOSWebKit: () => this.iosWebkitInfo.isIOSWebKit,
        isBufferGovernorActive: () => this.isBufferGovernorActive(),
        forceBufferGovernor: (active: boolean) => this._forceBufferGovernorActive(active),
        simulateBufferFailure: () => this._simulateBufferFailure(),
        config: BUFFER_GOVERNOR_CONFIG,
      };
    }
  }

  destroy(): void {
    if (this.metricsUpdateFrame) {
      cancelAnimationFrame(this.metricsUpdateFrame);
    }

    if (this.stallDetectionTimer) {
      clearTimeout(this.stallDetectionTimer);
    }

    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
    }

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    if (this.abortController) {
      this.abortController.abort();
    }

    this.stop();
    this.bufferGovernor.destroy();
    this.primaryAudio.src = '';
    this.secondaryAudio.src = '';
    this.primaryAudio.load();
    this.secondaryAudio.load();

    if (this.primaryAudio.parentNode) {
      this.primaryAudio.parentNode.removeChild(this.primaryAudio);
    }
    if (this.secondaryAudio.parentNode) {
      this.secondaryAudio.parentNode.removeChild(this.secondaryAudio);
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    }

    // Clean up debug interface
    if (typeof window !== 'undefined') {
      delete (window as any).__playerDebug;
    }

    window.removeEventListener('online', () => {});
    window.removeEventListener('offline', () => {});
  }
}
