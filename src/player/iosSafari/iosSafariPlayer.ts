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

  constructor(storageAdapter: StorageAdapter) {
    this.storageAdapter = storageAdapter;
    console.log('[IosSafariPlayer] Initialized (stub)');
  }

  // ============================================================================
  // PLAYBACK CONTROL
  // ============================================================================

  async loadTrack(trackId: string, filePath: string, _metadata?: TrackMetadata): Promise<void> {
    console.log('[IosSafariPlayer] loadTrack (stub):', trackId, filePath);
    this.currentTrackId = trackId;
    this.playbackState = 'loading';
    // TODO: Implement native HLS loading
    throw new Error('IosSafariPlayer.loadTrack not implemented');
  }

  async play(): Promise<void> {
    console.log('[IosSafariPlayer] play (stub)');
    // TODO: Implement native HLS playback
    throw new Error('IosSafariPlayer.play not implemented');
  }

  pause(): void {
    console.log('[IosSafariPlayer] pause (stub)');
    // TODO: Implement pause
  }

  stop(): void {
    console.log('[IosSafariPlayer] stop (stub)');
    this.playbackState = 'stopped';
    // TODO: Implement stop
  }

  seek(time: number): void {
    console.log('[IosSafariPlayer] seek (stub):', time);
    // TODO: Implement seek
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
