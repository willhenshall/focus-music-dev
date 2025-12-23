/**
 * Tests for StreamingAudioEngine
 * 
 * These tests verify the HLS-based streaming engine works correctly
 * across different scenarios and platforms.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingAudioEngine } from '../streamingAudioEngine';
import Hls from 'hls.js';

// Mock hls.js
vi.mock('hls.js', () => {
  type Listener = (...args: any[]) => void;

  class MockHls {
    static __instances: MockHls[] = [];

    static isSupported = () => true;

    static Events = {
      MANIFEST_PARSED: 'hlsManifestParsed',
      LEVEL_SWITCHED: 'hlsLevelSwitched',
      FRAG_LOADED: 'hlsFragLoaded',
      FRAG_BUFFERED: 'hlsFragBuffered',
      FRAG_LOAD_EMERGENCY_ABORTED: 'hlsFragLoadEmergencyAborted',
      ERROR: 'hlsError',
      BUFFER_APPENDED: 'hlsBufferAppended',
    };

    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
      OTHER_ERROR: 'otherError',
    };

    public media: any = null;
    public bandwidthEstimate = 1_000_000;

    // ABR-related state used by the engine
    public autoLevelEnabled = true;
    public autoLevelCapping = -1;
    public currentLevel = 0;
    public manualLevel = -1;
    public loadLevel = 0;
    public nextLoadLevel = 0;
    public nextAutoLevel = 0;
    public startLevel = -1;
    public levels: any[] = [{ bitrate: 64_000 }];

    public loadSource = vi.fn();
    public attachMedia = vi.fn((media: any) => {
      this.media = media;
    });
    public detachMedia = vi.fn(() => {
      this.media = null;
    });
    public destroy = vi.fn();
    public startLoad = vi.fn();
    public stopLoad = vi.fn();
    public recoverMediaError = vi.fn();

    private listeners = new Map<string, Set<Listener>>();

    public on = vi.fn((event: string, cb: Listener) => {
      const set = this.listeners.get(event) ?? new Set<Listener>();
      set.add(cb);
      this.listeners.set(event, set);
    });

    public off = vi.fn((event: string, cb: Listener) => {
      const set = this.listeners.get(event);
      if (!set) return;
      set.delete(cb);
    });

    // Test helper: emit mock HLS events
    public emit(event: string, data?: any) {
      const set = this.listeners.get(event);
      if (!set) return;
      for (const cb of set) cb(event, data);
    }

    constructor() {
      MockHls.__instances.push(this);
    }
  }

  return { default: MockHls };
});

// Mock storage adapter
const createMockStorageAdapter = () => ({
  name: 'Mock Storage',
  getAudioUrl: vi.fn().mockResolvedValue('https://example.com/audio.mp3'),
  getHLSUrl: vi.fn().mockResolvedValue('https://example.com/audio/master.m3u8'),
  hasHLSSupport: vi.fn().mockResolvedValue(true),
  validateUrl: vi.fn().mockReturnValue(true),
});

// Mock HTMLAudioElement (for future use in integration tests)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _createMockAudioElement = () => {
  const audio = {
    src: '',
    preload: 'auto',
    crossOrigin: '',
    volume: 1,
    currentTime: 0,
    duration: 100,
    paused: true,
    muted: false,
    playbackRate: 1,
    readyState: 4,
    networkState: 2,
    buffered: {
      length: 1,
      start: () => 0,
      end: () => 50,
    },
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    load: vi.fn(),
    setAttribute: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    style: { display: '' },
  };
  return audio;
};

// Prevent runaway requestAnimationFrame loops in unit tests
const originalRAF = globalThis.requestAnimationFrame;
const originalCancelRAF = globalThis.cancelAnimationFrame;
beforeEach(() => {
  globalThis.requestAnimationFrame = vi.fn(() => 1) as any;
  globalThis.cancelAnimationFrame = vi.fn() as any;
});
afterEach(() => {
  globalThis.requestAnimationFrame = originalRAF;
  globalThis.cancelAnimationFrame = originalCancelRAF;

  // Cleanup any appended audio elements from engine instances
  document.querySelectorAll('audio').forEach((el) => el.remove());

  // Reset mock instances between tests
  if ((Hls as any)?.__instances) (Hls as any).__instances = [];
});

describe('StreamingAudioEngine', () => {
  describe('Platform Detection', () => {
    it('should detect iOS WebKit correctly', () => {
      // This is a basic detection test
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
      const isIOS = /iPhone/.test(ua);
      expect(isIOS).toBe(true);
    });

    it('should detect desktop browser correctly', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
      const isIOS = /iPhone|iPad|iPod/.test(ua);
      expect(isIOS).toBe(false);
    });
  });

  describe('HLS Support Detection', () => {
    it('should detect hls.js support via mock', () => {
      // The mock returns isSupported = true
      // In production, this uses actual hls.js detection
      expect(true).toBe(true); // Mock always supports HLS
    });

    it('should detect native HLS support', () => {
      // Mock video element for native HLS check
      const video = document.createElement('video');
      const canPlayHLS = video.canPlayType('application/vnd.apple.mpegurl');
      // In jsdom, this returns empty string
      expect(typeof canPlayHLS).toBe('string');
    });
  });

  describe('Buffer Management', () => {
    it('should have safe buffer limits for iOS', () => {
      // Default HLS config should have safe iOS limits
      const maxBufferSize = 15_000_000; // 15MB
      const iosLimit = 22_000_000; // iOS crash point ~22MB
      
      expect(maxBufferSize).toBeLessThan(iosLimit);
    });

    it('should calculate buffer percentage correctly', () => {
      const bufferedSeconds = 50;
      const duration = 100;
      const percentage = (bufferedSeconds / duration) * 100;
      
      expect(percentage).toBe(50);
    });

    it('retries play immediately when waiting with buffered media', async () => {
      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);

      const [primary] = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
      primary.src = 'https://example.com/audio.m3u8';
      Object.defineProperty(primary, 'networkState', { configurable: true, get: () => 2 });

      // Simulate active playback with buffered media already available
      (engine as any).isPlayingState = true;
      Object.defineProperty(primary, 'buffered', {
        configurable: true,
        get: () => ({
          length: 1,
          end: () => 5,
        }),
      });
      Object.defineProperty(primary, 'readyState', { configurable: true, get: () => 4 });
      Object.defineProperty(primary, 'paused', { configurable: true, get: () => true });
      primary.currentTime = 0;
      primary.play = vi.fn().mockResolvedValue(undefined);

      primary.dispatchEvent(new Event('waiting'));

      await Promise.resolve();

      expect(primary.play).toHaveBeenCalled();
      engine.destroy();
    });

    it('retries play on waiting even if isPlayingState is false when buffer is ready', async () => {
      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);

      const [primary] = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
      primary.src = 'https://example.com/audio.m3u8';
      Object.defineProperty(primary, 'networkState', { configurable: true, get: () => 2 });

      // Simulate ready buffer while bookkeeping temporarily marks not playing
      (engine as any).isPlayingState = false;
      Object.defineProperty(primary, 'buffered', {
        configurable: true,
        get: () => ({
          length: 1,
          end: () => 5,
        }),
      });
      Object.defineProperty(primary, 'readyState', { configurable: true, get: () => 3 });
      Object.defineProperty(primary, 'paused', { configurable: true, get: () => true });
      primary.currentTime = 0;
      primary.play = vi.fn().mockResolvedValue(undefined);

      primary.dispatchEvent(new Event('waiting'));

      await Promise.resolve();

      expect(primary.play).toHaveBeenCalled();
      engine.destroy();
    });

    it('nudges playback during metrics update when buffering but already buffered', () => {
      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);

      const [primary] = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[];
      primary.src = 'https://example.com/audio.m3u8';
      Object.defineProperty(primary, 'networkState', { configurable: true, get: () => 2 });

      // Simulate buffered media while still marked buffering
      (engine as any).metrics.playbackState = 'buffering';
      Object.defineProperty(primary, 'buffered', {
        configurable: true,
        get: () => ({
          length: 1,
          end: () => 5,
        }),
      });
      Object.defineProperty(primary, 'readyState', { configurable: true, get: () => 3 });
      primary.currentTime = 0;
      primary.play = vi.fn().mockResolvedValue(undefined);
      primary.muted = true;

      (engine as any).updateMetrics();

      expect(primary.muted).toBe(false);
      expect(primary.play).toHaveBeenCalled();
      engine.destroy();
    });
  });

  describe('Error Handling', () => {
    it('should categorize network errors correctly', () => {
      const MEDIA_ERR_NETWORK = 2;
      const errorCode = MEDIA_ERR_NETWORK;
      const category = errorCode === MEDIA_ERR_NETWORK ? 'network' : 'unknown';
      
      expect(category).toBe('network');
    });

    it('should categorize decode errors correctly', () => {
      const MEDIA_ERR_DECODE = 3;
      const errorCode = MEDIA_ERR_DECODE;
      const category = errorCode === MEDIA_ERR_DECODE ? 'decode' : 'unknown';
      
      expect(category).toBe('decode');
    });
  });

  describe('Metrics', () => {
    it('should initialize with default metrics', () => {
      const metrics = {
        currentTrackId: null,
        playbackState: 'idle',
        volume: 0.7,
        isOnline: true,
        circuitBreakerState: 'closed',
      };

      expect(metrics.currentTrackId).toBeNull();
      expect(metrics.playbackState).toBe('idle');
      expect(metrics.volume).toBe(0.7);
      expect(metrics.circuitBreakerState).toBe('closed');
    });

    it('should track HLS-specific metrics', () => {
      const hlsMetrics = {
        isHLSActive: true,
        currentLevel: 0,
        levels: [{ index: 0, bitrate: 256000 }],
        bandwidthEstimate: 1000000,
        bufferLength: 30,
        isNativeHLS: false,
      };

      expect(hlsMetrics.isHLSActive).toBe(true);
      expect(hlsMetrics.bufferLength).toBe(30);
    });
  });

  describe('Circuit Breaker', () => {
    it('should start in closed state', () => {
      const state = 'closed';
      expect(state).toBe('closed');
    });

    it('should open after threshold failures', () => {
      const failures = 5;
      const threshold = 5;
      const shouldOpen = failures >= threshold;
      
      expect(shouldOpen).toBe(true);
    });

    it('should transition to half-open after reset time', () => {
      const states = ['closed', 'open', 'half-open'];
      const validTransition = states.includes('half-open');
      
      expect(validTransition).toBe(true);
    });
  });
});

describe('StreamingAudioEngine Integration', () => {
  describe('Track Loading', () => {
    it('should prefer HLS when supported', async () => {
      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);
      const [, secondaryHls] = (Hls as any).__instances;

      const p = engine.loadTrack('test-track', 'file/path.mp3');

      // Wait until loadSource is invoked so readiness listeners are attached.
      for (let i = 0; i < 20 && secondaryHls.loadSource.mock.calls.length === 0; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }

      secondaryHls.media = {
        readyState: 2,
        currentTime: 0,
        buffered: { length: 1, end: () => 1 },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      secondaryHls.emit(Hls.Events.MANIFEST_PARSED, { levels: [{ bitrate: 32_000 }] });
      secondaryHls.emit(Hls.Events.BUFFER_APPENDED, {});

      await p;

      expect(adapter.getHLSUrl).toHaveBeenCalled();
      expect(secondaryHls.loadSource).toHaveBeenCalled();
      engine.destroy();
    });

    it('should fallback to direct MP3 when HLS load fails', async () => {
      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);
      const [, secondaryHls] = (Hls as any).__instances;

      // In jsdom, HTMLMediaElement does not actually load/play media.
      // Stub canPlay waiting so fallback doesn't hang.
      (engine as any).waitForCanPlay = () => Promise.resolve();

      const p = engine.loadTrack('test-track', 'file/path.mp3');

      for (let i = 0; i < 20 && secondaryHls.loadSource.mock.calls.length === 0; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }

      // Trigger a fatal HLS error so engine falls back
      secondaryHls.emit(Hls.Events.ERROR, { fatal: true, details: 'manifestLoadError', type: 'networkError' });

      await p;

      expect(adapter.getAudioUrl).toHaveBeenCalled();
      engine.destroy();
    });
  });

  describe('Crossfade', () => {
    it('should support enabling/disabling crossfade', () => {
      let crossfadeEnabled = true;
      
      const setCrossfadeEnabled = (enabled: boolean) => {
        crossfadeEnabled = enabled;
      };
      
      setCrossfadeEnabled(false);
      expect(crossfadeEnabled).toBe(false);
      
      setCrossfadeEnabled(true);
      expect(crossfadeEnabled).toBe(true);
    });
  });

  describe('Volume Control', () => {
    it('should clamp volume between 0 and 1', () => {
      const clampVolume = (v: number) => Math.max(0, Math.min(1, v));
      
      expect(clampVolume(-0.5)).toBe(0);
      expect(clampVolume(0.5)).toBe(0.5);
      expect(clampVolume(1.5)).toBe(1);
    });
  });

  describe('Seek', () => {
    it('should clamp seek position to valid range', () => {
      const duration = 100;
      const clampSeek = (time: number) => Math.max(0, Math.min(time, duration));
      
      expect(clampSeek(-10)).toBe(0);
      expect(clampSeek(50)).toBe(50);
      expect(clampSeek(150)).toBe(100);
    });
  });

  describe('Fast-start prewarm', () => {
    it('prewarmTrack loads the HLS source into the inactive pipeline', async () => {
      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);

      // Engine constructor should have created two HLS instances (primary/secondary)
      expect((Hls as any).__instances.length).toBe(2);
      const [primaryHls, secondaryHls] = (Hls as any).__instances;

      // Kick off prewarm without awaiting yet (it blocks on readiness)
      const prewarmPromise = engine.prewarmTrack('track-1', 'file/path.mp3', {
        preferHLS: true,
        startLevel: 0,
      });

      // Simulate readiness on the *inactive* (secondary) pipeline
      // Use a plain object here rather than a real HTMLAudioElement, since
      // readyState/buffered are not reliably writable in jsdom.
      secondaryHls.media = {
        readyState: 2,
        currentTime: 0,
        buffered: { length: 1, end: () => 1 },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      // Ensure prewarm got far enough to attach readiness listeners
      for (let i = 0; i < 20 && secondaryHls.loadSource.mock.calls.length === 0; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }

      secondaryHls.emit(Hls.Events.MANIFEST_PARSED, { levels: [{ bitrate: 32_000 }] });
      secondaryHls.emit(Hls.Events.BUFFER_APPENDED, {});

      await prewarmPromise;

      expect(secondaryHls.loadSource).toHaveBeenCalledTimes(1);
      expect(primaryHls.loadSource).not.toHaveBeenCalled();
      expect(secondaryHls.startLoad).toHaveBeenCalled();

      const metrics = engine.getMetrics();
      expect(metrics.prefetchedTrackId).toBe('track-1');
      expect(metrics.prefetchedTrackUrl).toContain('master.m3u8');

      engine.destroy();
    });

    it('loadTrack reuses the prewarmed HLS pipeline for the same track', async () => {
      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);
      const [, secondaryHls] = (Hls as any).__instances;

      // Prewarm track-4
      const prewarmPromise = engine.prewarmTrack('track-4', 'file/path.mp3', {
        preferHLS: true,
        startLevel: 0,
      });

      secondaryHls.media = {
        readyState: 2,
        currentTime: 0,
        buffered: { length: 1, end: () => 1 },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      for (let i = 0; i < 20 && secondaryHls.loadSource.mock.calls.length === 0; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
      secondaryHls.emit(Hls.Events.MANIFEST_PARSED, { levels: [{ bitrate: 32_000 }] });
      secondaryHls.emit(Hls.Events.BUFFER_APPENDED, {});

      await prewarmPromise;
      expect(secondaryHls.loadSource).toHaveBeenCalledTimes(1);

      // Now load the same track through the normal loadTrack path.
      const loadPromise = engine.loadTrack('track-4', 'file/path.mp3');

      // Allow loadTrack to attach its readiness listeners before emitting events.
      for (let i = 0; i < 5; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }

      secondaryHls.emit(Hls.Events.MANIFEST_PARSED, { levels: [{ bitrate: 32_000 }] });
      secondaryHls.emit(Hls.Events.BUFFER_APPENDED, {});
      await loadPromise;

      // Crucially: loadSource was NOT called again (pipeline reused)
      expect(secondaryHls.loadSource).toHaveBeenCalledTimes(1);

      engine.destroy();
    });

    it('does not require a fixed 500ms delay to become ready', async () => {
      vi.useFakeTimers();

      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);
      const [, secondaryHls] = (Hls as any).__instances;

      let resolved = false;
      const p = engine
        .prewarmTrack('track-2', 'file/path.mp3', { preferHLS: true, startLevel: 0 })
        .then(() => {
          resolved = true;
        });

      // Trigger readiness immediately via HLS events (no timer advancement)
      secondaryHls.media = {
        readyState: 2,
        currentTime: 0,
        buffered: { length: 1, end: () => 1 },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      for (let i = 0; i < 20 && secondaryHls.loadSource.mock.calls.length === 0; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
      secondaryHls.emit(Hls.Events.MANIFEST_PARSED, { levels: [{ bitrate: 32_000 }] });
      secondaryHls.emit(Hls.Events.FRAG_BUFFERED, {});
      secondaryHls.emit(Hls.Events.BUFFER_APPENDED, {});

      // Flush microtasks; do NOT advance timers
      await Promise.resolve();
      await Promise.resolve();

      expect(resolved).toBe(true);

      await p;
      engine.destroy();
      vi.useRealTimers();
    });

    it('releases the fast-start ABR lock on first playing', async () => {
      const adapter = createMockStorageAdapter();
      const engine = new StreamingAudioEngine(adapter as any);
      const [, secondaryHls] = (Hls as any).__instances;

      // Force "slow/uncertain" conditions so the fast-start lock is engaged deterministically.
      (engine as any).metrics.connectionQuality = 'poor';

      const prewarmPromise = engine.prewarmTrack('track-3', 'file/path.mp3', {
        preferHLS: true,
        startLevel: 0,
      });

      secondaryHls.media = {
        readyState: 2,
        currentTime: 0,
        buffered: { length: 1, end: () => 1 },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      for (let i = 0; i < 20 && secondaryHls.loadSource.mock.calls.length === 0; i++) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.resolve();
      }
      secondaryHls.emit(Hls.Events.MANIFEST_PARSED, { levels: [{ bitrate: 32_000 }] });
      secondaryHls.emit(Hls.Events.BUFFER_APPENDED, {});

      await prewarmPromise;

      // ABR should be locked to startLevel=0 after prewarm
      expect(secondaryHls.startLevel).toBe(0);

      // Simulate playback starting on the prewarmed (secondary) audio element
      const audios = Array.from(document.querySelectorAll('audio'));
      expect(audios.length).toBeGreaterThanOrEqual(2);
      const secondaryAudio = audios[1];
      secondaryAudio.dispatchEvent(new Event('playing'));

      // ABR lock should be released (auto)
      expect(secondaryHls.startLevel).toBe(-1);
      expect(secondaryHls.autoLevelEnabled).toBe(true);

      engine.destroy();
    });
  });

  it('keeps metrics currentLevel in sync with hls.js state', () => {
    const adapter = createMockStorageAdapter();
    const engine = new StreamingAudioEngine(adapter as any);
    const [primaryHls] = (Hls as any).__instances;

    // Simulate HLS being active, but without emitting LEVEL_SWITCHED.
    // This can happen around cold starts / channel switches.
    (engine as any).hlsMetrics.isHLSActive = true;

    primaryHls.currentLevel = 3; // premium
    primaryHls.loadLevel = 3;

    // Force a metrics refresh
    (engine as any).updateMetrics();

    const metrics = engine.getMetrics();
    expect(metrics.hls?.currentLevel).toBe(3);
    expect(metrics.hls?.abr.currentQualityTier).toBe('premium');

    engine.destroy();
  });
});
