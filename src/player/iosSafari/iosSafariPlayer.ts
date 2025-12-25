/**
 * iOS Safari Native HLS Player
 *
 * This adapter uses native HLS playback via HTMLMediaElement for iOS Safari.
 * iOS Safari has built-in HLS support and handles ABR automatically.
 *
 * Key differences from StreamingAudioEngine:
 * - No hls.js dependency (native HLS)
 * - Browser-controlled ABR (no manual level switching)
 * - iOS-specific audio unlock and buffer management
 *
 * @see https://developer.apple.com/documentation/http_live_streaming
 */

import type {
  IAudioEngine,
  AudioMetrics,
  AudioEngineCallbacks,
  TrackMetadata,
  StorageAdapter,
  HLSStorageAdapter,
  CrossfadeMode,
  PlaybackState,
  ConnectionQuality,
  CircuitBreakerState,
} from '../../lib/types/audioEngine';

export class IosSafariPlayer implements IAudioEngine {
  private storageAdapter: StorageAdapter;
  private callbacks: AudioEngineCallbacks = {};
  private crossfadeMode: CrossfadeMode = 'overlap';
  private crossfadeDuration: number = 500;
  private volume: number = 1.0;
  private currentTrackId: string | null = null;
  private playbackState: PlaybackState = 'idle';
  private audio: HTMLAudioElement;
  private trackDuration: number = 0;

  constructor(storageAdapter: StorageAdapter) {
    this.storageAdapter = storageAdapter;
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.setupEventListeners();
    console.log('[IosSafariPlayer] Initialized');
  }

  private setupEventListeners(): void {
    this.audio.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.audio.addEventListener('error', this.handleError);
    this.audio.addEventListener('ended', this.handleEnded);
  }

  private handleLoadedMetadata = (): void => {
    this.trackDuration = this.audio.duration;
    this.playbackState = 'paused';
    console.log('[IosSafariPlayer] Metadata loaded, duration:', this.trackDuration);

    if (this.currentTrackId && this.callbacks.onTrackLoad) {
      this.callbacks.onTrackLoad(this.currentTrackId, this.trackDuration);
    }
  };

  private handleError = (): void => {
    const error = this.audio.error;
    const errorMessage = error
      ? `MediaError code ${error.code}: ${error.message || 'Unknown error'}`
      : 'Unknown audio error';

    console.error('[IosSafariPlayer] Audio error:', errorMessage);
    this.playbackState = 'error';

    if (this.callbacks.onError) {
      this.callbacks.onError(new Error(errorMessage), 'unknown', false);
    }
  };

  private handleEnded = (): void => {
    console.log('[IosSafariPlayer] Track ended');
    this.playbackState = 'stopped';

    if (this.callbacks.onTrackEnd) {
      this.callbacks.onTrackEnd();
    }
  };

  // ============================================================================
  // PLAYBACK CONTROL
  // ============================================================================

  async loadTrack(trackId: string, _filePath: string, _metadata?: TrackMetadata): Promise<void> {
    console.log('[IosSafariPlayer] loadTrack:', trackId);

    this.currentTrackId = trackId;
    this.playbackState = 'loading';
    this.trackDuration = 0;

    // Build HLS URL using the storage adapter
    const hlsAdapter = this.storageAdapter as HLSStorageAdapter;
    const hlsUrl = await hlsAdapter.getHLSUrl(trackId, `${trackId}/master.m3u8`);

    console.log('[IosSafariPlayer] Loading HLS URL:', hlsUrl);

    // Set the source and trigger load
    this.audio.src = hlsUrl;
    this.audio.load();
  }

  async play(): Promise<void> {
    console.log('[IosSafariPlayer] play');
    try {
      await this.audio.play();
      this.playbackState = 'playing';
      console.log('[IosSafariPlayer] Playback started');
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') {
        console.warn('[IosSafariPlayer] Play rejected - user gesture required');
        if (this.callbacks.onError) {
          this.callbacks.onError(
            new Error('Playback requires user interaction. Please tap play.'),
            'unknown',
            true // recoverable
          );
        }
      } else {
        console.error('[IosSafariPlayer] Play failed:', error);
        this.playbackState = 'error';
        if (this.callbacks.onError) {
          this.callbacks.onError(
            error instanceof Error ? error : new Error(String(error)),
            'unknown',
            false
          );
        }
      }
      throw error;
    }
  }

  pause(): void {
    console.log('[IosSafariPlayer] pause');
    this.audio.pause();
    this.playbackState = 'paused';
  }

  stop(): void {
    console.log('[IosSafariPlayer] stop');
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.currentTrackId = null;
    this.trackDuration = 0;
    this.playbackState = 'stopped';
  }

  seek(timeSeconds: number): void {
    console.log('[IosSafariPlayer] seek:', timeSeconds);
    // Clamp to valid range [0, duration]
    const duration = this.trackDuration > 0 ? this.trackDuration : this.audio.duration;
    let clampedTime = Math.max(0, timeSeconds);
    if (duration && !isNaN(duration) && isFinite(duration)) {
      clampedTime = Math.min(clampedTime, duration);
    }
    this.audio.currentTime = clampedTime;
  }

  // ============================================================================
  // VOLUME
  // ============================================================================

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
  }

  getVolume(): number {
    return this.volume;
  }

  // ============================================================================
  // STATE
  // ============================================================================

  getCurrentTime(): number {
    // TODO: Return actual current time from audio element
    return 0;
  }

  getDuration(): number {
    // TODO: Return actual duration from audio element
    return 0;
  }

  isPlaying(): boolean {
    return this.playbackState === 'playing';
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  getMetrics(): AudioMetrics {
    return this.createDefaultMetrics();
  }

  private createDefaultMetrics(): AudioMetrics {
    return {
      currentTrackId: this.currentTrackId,
      currentTrackUrl: null,
      storageBackend: this.storageAdapter.name,
      loadStartTime: 0,
      loadEndTime: 0,
      loadDuration: 0,
      networkState: 0,
      networkStateLabel: 'NETWORK_EMPTY',
      readyState: 0,
      readyStateLabel: 'HAVE_NOTHING',
      playbackState: this.playbackState,
      currentTime: 0,
      duration: 0,
      buffered: 0,
      bufferPercentage: 0,
      volume: this.volume,
      muted: false,
      playbackRate: 1.0,
      error: null,
      errorCategory: null,
      isStalled: false,
      isWaiting: false,
      canPlayThrough: false,
      mediaSessionActive: false,
      audioElement: 'primary',
      prefetchedTrackId: null,
      prefetchedTrackUrl: null,
      prefetchProgress: 0,
      prefetchReadyState: 0,
      estimatedBandwidth: 0,
      bytesLoaded: 0,
      totalBytes: 0,
      downloadSpeed: 0,
      isOnline: navigator.onLine,
      connectionQuality: 'good' as ConnectionQuality,
      retryAttempt: 0,
      maxRetries: 5,
      nextRetryIn: 0,
      circuitBreakerState: 'closed' as CircuitBreakerState,
      failureCount: 0,
      successCount: 0,
      sessionSuccessRate: 1.0,
      stallCount: 0,
      recoveryAttempts: 0,
      iosClamp: {
        isIOSWebKit: true,
        isClampActive: false,
        bufferLimitMB: 15,
        currentBufferMB: 0,
        prefetchDisabled: false,
      },
      hls: {
        isHLSActive: true,
        currentLevel: -1,
        levels: [],
        bandwidthEstimate: 0,
        bufferedSegments: 0,
        bufferLength: 0,
        targetBuffer: 30,
        isNativeHLS: true, // Key difference: native HLS, not hls.js
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
          abrState: 'native', // Browser-controlled ABR
          effectiveBandwidth: 0,
          currentQualityTier: 'unknown',
          recommendedQualityTier: 'unknown',
          isUpgrading: false,
          isDowngrading: false,
          timeSinceSwitch: 0,
        },
      },
    };
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  setCallbacks(callbacks: AudioEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  setCrossfadeEnabled(enabled: boolean): void {
    this.crossfadeMode = enabled ? 'overlap' : 'none';
  }

  setStorageAdapter(adapter: StorageAdapter): void {
    this.storageAdapter = adapter;
  }

  setCrossfadeMode(mode: CrossfadeMode): void {
    this.crossfadeMode = mode;
  }

  setCrossfadeDuration(durationMs: number): void {
    this.crossfadeDuration = durationMs;
  }

  getCrossfadeMode(): CrossfadeMode {
    return this.crossfadeMode;
  }

  getCrossfadeDuration(): number {
    return this.crossfadeDuration;
  }

  // ============================================================================
  // PREFETCH
  // ============================================================================

  prefetchNextTrack(trackId: string, _filePath: string): void {
    console.log('[IosSafariPlayer] prefetchNextTrack (stub):', trackId);
    // TODO: Implement prefetch for gapless playback
  }

  // ============================================================================
  // iOS-SPECIFIC
  // ============================================================================

  /**
   * Unlock iOS audio context from user gesture.
   * Must be called synchronously from a user interaction event.
   */
  unlockIOSAudio(): void {
    console.log('[IosSafariPlayer] unlockIOSAudio (stub)');
    // TODO: Implement iOS audio unlock with silent audio play
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    console.log('[IosSafariPlayer] destroy');
    this.audio.removeEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.audio.removeEventListener('error', this.handleError);
    this.audio.removeEventListener('ended', this.handleEnded);
    this.stop();
    this.callbacks = {};
  }

  /**
   * Get current callbacks (for testing/debugging).
   */
  getCallbacks(): AudioEngineCallbacks {
    return this.callbacks;
  }
}
