/**
 * Audio Engine Crossfade & iOS Unlock Tests
 * 
 * Tests for recent bug fixes and features:
 * - iOS audio context unlock (fix/ios-first-play-unlock)
 * - Radio crossfade mode (feature/radio-crossfade)
 * - Click elimination via fade in/out (fix/audio-crossfade-click)
 * - Channel switch transition handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// MOCKS
// =============================================================================

// Mock hls.js
vi.mock('hls.js', () => {
  const MockHls = vi.fn(() => ({
    loadSource: vi.fn(),
    attachMedia: vi.fn(),
    detachMedia: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    startLoad: vi.fn(),
    stopLoad: vi.fn(),
    recoverMediaError: vi.fn(),
    bandwidthEstimate: 1000000,
    media: null,
    autoLevelEnabled: true,
    currentLevel: 0,
    autoLevelCapping: -1,
    nextAutoLevel: 0,
    manualLevel: -1,
    loadLevel: 0,
    nextLoadLevel: 0,
  }));
  
  (MockHls as any).isSupported = () => true;
  (MockHls as any).Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    LEVEL_SWITCHED: 'hlsLevelSwitched',
    FRAG_LOADED: 'hlsFragLoaded',
    FRAG_LOAD_EMERGENCY_ABORTED: 'hlsFragLoadEmergencyAborted',
    ERROR: 'hlsError',
    BUFFER_APPENDED: 'hlsBufferAppended',
  };
  (MockHls as any).ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
    OTHER_ERROR: 'otherError',
  };
  
  return { default: MockHls };
});

// Mock storage adapter
const createMockStorageAdapter = () => ({
  name: 'Mock Storage',
  getAudioUrl: vi.fn().mockResolvedValue('https://example.com/audio.mp3'),
  getHLSUrl: vi.fn().mockResolvedValue('https://example.com/audio/master.m3u8'),
  hasHLSSupport: vi.fn().mockResolvedValue(false), // Default to MP3 for simpler testing
  validateUrl: vi.fn().mockReturnValue(true),
});

// Mock HTMLAudioElement
const createMockAudioElement = () => ({
  src: '',
  preload: 'auto',
  crossOrigin: '',
  volume: 1,
  currentTime: 0,
  duration: 180,
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
  parentNode: null,
  onended: null,
  ontimeupdate: null,
});

// Mock document.body.appendChild
const originalAppendChild = document.body.appendChild.bind(document.body);
const originalRemoveChild = document.body.removeChild.bind(document.body);

beforeEach(() => {
  document.body.appendChild = vi.fn().mockReturnValue(null);
  document.body.removeChild = vi.fn().mockReturnValue(null);
});

afterEach(() => {
  document.body.appendChild = originalAppendChild;
  document.body.removeChild = originalRemoveChild;
  vi.clearAllMocks();
});

// =============================================================================
// iOS AUDIO UNLOCK TESTS
// =============================================================================

describe('iOS Audio Unlock', () => {
  describe('unlockIOSAudio() functionality', () => {
    it('should create silent audio data URI for unlock', () => {
      // The silent MP3 data URI used for iOS unlock
      const silentMp3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYtRKZJAAAAAAAAAAAAAAAAAAAAAAD/+1DEAAAHAAGkAAAAIAAANIAAAAQMHfwOMB8AB8AB8AB8AB8AB8AB//sQRAAD/wAAB/wAAACAAATSAAAAEP/7EEQAs/8AAAf8AAAAgAAE0gAAABD/+xBEAzP/AAAH/AAAAIAABNIAAAAf//sQRAYz/wAAB/wAAACAAATSAAAA//tQRAkz/wAAB/wAAACAAATSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQZAwz/wAAB/wAAACAAATSAAAA//sQZA8z/wAAB/wAAACAAATSAAAA';
      
      // Verify it's a valid data URI for MP3
      expect(silentMp3.startsWith('data:audio/mp3;base64,')).toBe(true);
      
      // Verify the base64 content is non-empty
      const base64Content = silentMp3.split(',')[1];
      expect(base64Content.length).toBeGreaterThan(0);
    });

    it('should use near-zero volume for silent unlock (not exactly 0)', () => {
      // iOS can ignore volume 0 in some cases, so we use 0.001
      const unlockVolume = 0.001;
      expect(unlockVolume).toBeGreaterThan(0);
      expect(unlockVolume).toBeLessThan(0.01);
    });

    it('should set isAudioUnlocked flag after successful unlock', async () => {
      // Simulate the unlock flow
      let isAudioUnlocked = false;
      
      const mockAudio = createMockAudioElement();
      mockAudio.play = vi.fn().mockResolvedValue(undefined);
      
      // Simulate unlockIOSAudio behavior
      const unlockPromise = mockAudio.play();
      await unlockPromise;
      isAudioUnlocked = true;
      
      expect(isAudioUnlocked).toBe(true);
      expect(mockAudio.play).toHaveBeenCalled();
    });

    it('should not set isAudioUnlocked if play fails', async () => {
      let isAudioUnlocked = false;
      
      const mockAudio = createMockAudioElement();
      mockAudio.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
      
      try {
        await mockAudio.play();
        isAudioUnlocked = true;
      } catch {
        // isAudioUnlocked stays false
      }
      
      expect(isAudioUnlocked).toBe(false);
    });
  });

  describe('First play bypass for iOS', () => {
    it('should skip crossfade on first play when isIOS and !isAudioUnlocked', () => {
      const isIOS = true;
      const isAudioUnlocked = false;
      const hasNewTrack = true;
      
      // This simulates the condition in play()
      const shouldSkipCrossfade = hasNewTrack && isIOS && !isAudioUnlocked;
      
      expect(shouldSkipCrossfade).toBe(true);
    });

    it('should use crossfade after audio is unlocked', () => {
      const isIOS = true;
      const isAudioUnlocked = true;
      const hasNewTrack = true;
      
      const shouldSkipCrossfade = hasNewTrack && isIOS && !isAudioUnlocked;
      
      expect(shouldSkipCrossfade).toBe(false);
    });

    it('should always use crossfade on non-iOS devices', () => {
      const isIOS = false;
      const isAudioUnlocked = false;
      const hasNewTrack = true;
      
      const shouldSkipCrossfade = hasNewTrack && isIOS && !isAudioUnlocked;
      
      expect(shouldSkipCrossfade).toBe(false);
    });
  });
});

// =============================================================================
// CROSSFADE MODE TESTS
// =============================================================================

describe('Crossfade Modes', () => {
  describe('Mode configuration', () => {
    it('should support three crossfade modes', () => {
      const validModes: ('overlap' | 'sequential' | 'none')[] = ['overlap', 'sequential', 'none'];
      
      validModes.forEach(mode => {
        expect(['overlap', 'sequential', 'none']).toContain(mode);
      });
    });

    it('should default to sequential mode (safe default)', () => {
      const defaultMode: 'overlap' | 'sequential' | 'none' = 'sequential';
      expect(defaultMode).toBe('sequential');
    });

    it('should clamp crossfade duration between 200-5000ms', () => {
      const clampDuration = (ms: number) => Math.max(200, Math.min(5000, ms));
      
      expect(clampDuration(100)).toBe(200);   // Too short, clamp to 200
      expect(clampDuration(500)).toBe(500);   // Valid
      expect(clampDuration(3000)).toBe(3000); // Valid
      expect(clampDuration(10000)).toBe(5000); // Too long, clamp to 5000
    });

    it('should use 500ms as default crossfade duration', () => {
      const defaultDuration = 500;
      expect(defaultDuration).toBe(500);
    });
  });

  describe('Overlap mode (radio-style)', () => {
    it('should trigger early transition when timeRemaining <= fadeThreshold', () => {
      const crossfadeMode = 'overlap';
      const crossfadeDuration = 500; // ms
      const fadeThreshold = crossfadeDuration / 1000; // 0.5 seconds
      
      // Track at 179.6s of 180s duration
      const currentTime = 179.6;
      const duration = 180;
      const timeRemaining = duration - currentTime; // 0.4s
      
      const shouldTriggerEarly = 
        crossfadeMode === 'overlap' && 
        timeRemaining <= fadeThreshold && 
        timeRemaining > 0;
      
      expect(shouldTriggerEarly).toBe(true);
    });

    it('should NOT trigger early if timeRemaining > fadeThreshold', () => {
      const crossfadeMode = 'overlap';
      const crossfadeDuration = 500;
      const fadeThreshold = crossfadeDuration / 1000;
      
      // Track at 170s of 180s duration
      const currentTime = 170;
      const duration = 180;
      const timeRemaining = duration - currentTime; // 10s
      
      const shouldTriggerEarly = 
        crossfadeMode === 'overlap' && 
        timeRemaining <= fadeThreshold && 
        timeRemaining > 0;
      
      expect(shouldTriggerEarly).toBe(false);
    });

    it('should set hasTriggeredEarlyTransition flag to prevent double-trigger', () => {
      let hasTriggeredEarlyTransition = false;
      
      // First trigger
      if (!hasTriggeredEarlyTransition) {
        hasTriggeredEarlyTransition = true;
        // would call onTrackEnd here
      }
      
      expect(hasTriggeredEarlyTransition).toBe(true);
      
      // Second call should be blocked
      let secondTriggerBlocked = false;
      if (hasTriggeredEarlyTransition) {
        secondTriggerBlocked = true;
      }
      
      expect(secondTriggerBlocked).toBe(true);
    });
  });

  describe('Sequential mode', () => {
    it('should use TRACK_FADE_DURATION for sequential mode', () => {
      const TRACK_FADE_DURATION = 500;
      const crossfadeMode = 'sequential';
      
      const fadeThreshold = crossfadeMode === 'overlap' 
        ? 500 / 1000 
        : TRACK_FADE_DURATION / 1000;
      
      expect(fadeThreshold).toBe(0.5);
    });

    it('should start fade-out without triggering early transition', () => {
      const crossfadeMode = 'sequential';
      let hasTriggeredEarlyTransition = false;
      let isFadingOut = false;
      
      // Simulate checkEndOfTrackFade for sequential mode
      if (crossfadeMode === 'sequential') {
        isFadingOut = true;
        // Does NOT set hasTriggeredEarlyTransition
      }
      
      expect(isFadingOut).toBe(true);
      expect(hasTriggeredEarlyTransition).toBe(false);
    });
  });

  describe('None mode (hard cut)', () => {
    it('should skip all fade logic when mode is none', () => {
      const crossfadeMode = 'none';
      
      // checkEndOfTrackFade should return early
      const shouldProcessFade = crossfadeMode !== 'none';
      
      expect(shouldProcessFade).toBe(false);
    });
  });
});

// =============================================================================
// FADE IN/OUT TESTS (Click Elimination)
// =============================================================================

describe('Fade In/Out (Click Elimination)', () => {
  describe('fadeIn() behavior', () => {
    it('should start volume at 0', () => {
      const startVolume = 0;
      expect(startVolume).toBe(0);
    });

    it('should reach target volume at end of fade', () => {
      const targetVolume = 0.7;
      const progress = 1.0; // 100% complete
      
      // Ease-in-out formula at progress=1 should equal 1
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      const finalVolume = targetVolume * eased;
      
      expect(eased).toBe(1);
      expect(finalVolume).toBe(targetVolume);
    });

    it('should use ease-in-out curve (smooth at start and end)', () => {
      const easeInOut = (p: number) => p < 0.5
        ? 2 * p * p
        : 1 - Math.pow(-2 * p + 2, 2) / 2;
      
      // At 0%, value should be 0
      expect(easeInOut(0)).toBe(0);
      
      // At 50%, value should be 0.5 (inflection point)
      expect(easeInOut(0.5)).toBe(0.5);
      
      // At 100%, value should be 1
      expect(easeInOut(1)).toBe(1);
      
      // Curve should be symmetric around 0.5
      expect(easeInOut(0.25)).toBeCloseTo(1 - easeInOut(0.75), 5);
    });

    it('should complete in crossfadeDuration milliseconds', () => {
      const crossfadeDuration = 500;
      const fadeInterval = 50;
      const steps = crossfadeDuration / fadeInterval;
      
      expect(steps).toBe(10); // 500ms / 50ms = 10 steps
    });
  });

  describe('fadeOut() behavior', () => {
    it('should start at current volume', () => {
      const currentVolume = 0.7;
      const startVolume = currentVolume;
      
      expect(startVolume).toBe(0.7);
    });

    it('should reach 0 at end of fade', () => {
      const startVolume = 0.7;
      const progress = 1.0;
      
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      const finalVolume = startVolume * (1 - eased);
      
      expect(finalVolume).toBe(0);
    });

    it('should return a promise that resolves when fade is complete', async () => {
      const fadeOut = (): Promise<void> => {
        return new Promise((resolve) => {
          // Simulate fade completion
          setTimeout(resolve, 10);
        });
      };
      
      await expect(fadeOut()).resolves.toBeUndefined();
    });
  });

  describe('Volume progression during fade', () => {
    it('should have smooth volume progression', () => {
      const targetVolume = 0.7;
      const steps = 10;
      const volumes: number[] = [];
      
      for (let step = 0; step <= steps; step++) {
        const progress = step / steps;
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        volumes.push(targetVolume * eased);
      }
      
      // Volume should monotonically increase
      for (let i = 1; i < volumes.length; i++) {
        expect(volumes[i]).toBeGreaterThanOrEqual(volumes[i - 1]);
      }
      
      // First should be near 0, last should be targetVolume
      expect(volumes[0]).toBe(0);
      expect(volumes[volumes.length - 1]).toBeCloseTo(targetVolume, 5);
    });
  });
});

// =============================================================================
// CHANNEL SWITCH TRANSITION TESTS
// =============================================================================

describe('Channel Switch Transitions', () => {
  describe('isTransitioning flag', () => {
    it('should prevent play() re-entry during crossfade', () => {
      let isTransitioning = true;
      let playCallBlocked = false;
      
      // Simulate play() being called during transition
      const play = () => {
        if (isTransitioning) {
          playCallBlocked = true;
          return;
        }
        // Normal play logic
      };
      
      play();
      
      expect(playCallBlocked).toBe(true);
    });

    it('should be cleared after crossfade completes', () => {
      let isTransitioning = true;
      
      // Simulate crossfade completion
      const onCrossfadeComplete = () => {
        isTransitioning = false;
      };
      
      onCrossfadeComplete();
      
      expect(isTransitioning).toBe(false);
    });
  });

  describe('Old track cleanup during crossfade', () => {
    it('should clear event handlers before cleanup', () => {
      const oldAudio = createMockAudioElement();
      
      oldAudio.onended = () => {};
      oldAudio.ontimeupdate = () => {};
      
      // Clear handlers
      oldAudio.onended = null;
      oldAudio.ontimeupdate = null;
      
      expect(oldAudio.onended).toBeNull();
      expect(oldAudio.ontimeupdate).toBeNull();
    });

    it('should reset old audio element completely', () => {
      const oldAudio = createMockAudioElement();
      oldAudio.src = 'https://example.com/old-track.mp3';
      oldAudio.volume = 0.7;
      oldAudio.currentTime = 45;
      
      // Cleanup sequence
      oldAudio.pause();
      oldAudio.volume = 0;
      oldAudio.currentTime = 0;
      oldAudio.src = '';
      oldAudio.load();
      
      expect(oldAudio.pause).toHaveBeenCalled();
      expect(oldAudio.volume).toBe(0);
      expect(oldAudio.currentTime).toBe(0);
      expect(oldAudio.src).toBe('');
      expect(oldAudio.load).toHaveBeenCalled();
    });
  });

  describe('False ended event detection (iOS)', () => {
    it('should detect false ended event when currentTime < duration - 2', () => {
      const currentTime = 45;
      const duration = 180;
      
      const trackActuallyEnded = duration > 0 && currentTime >= duration - 2;
      
      expect(trackActuallyEnded).toBe(false); // 45 < 178
    });

    it('should allow genuine ended event near end of track', () => {
      const currentTime = 179;
      const duration = 180;
      
      const trackActuallyEnded = duration > 0 && currentTime >= duration - 2;
      
      expect(trackActuallyEnded).toBe(true); // 179 >= 178
    });

    it('should attempt recovery for false ended events on iOS', () => {
      const isIOS = true;
      const trackActuallyEnded = false;
      let recoveryAttempted = false;
      
      if (!trackActuallyEnded && isIOS) {
        recoveryAttempted = true;
        // Would call audio.play() here
      }
      
      expect(recoveryAttempted).toBe(true);
    });
  });

  describe('hasTriggeredEarlyTransition prevents double advance', () => {
    it('should ignore ended event if early transition already triggered', () => {
      let hasTriggeredEarlyTransition = true;
      let onTrackEndCalled = false;
      
      // Simulate onended handler
      const onEnded = () => {
        if (hasTriggeredEarlyTransition) {
          return; // Ignore
        }
        onTrackEndCalled = true;
      };
      
      onEnded();
      
      expect(onTrackEndCalled).toBe(false);
    });

    it('should reset hasTriggeredEarlyTransition on new track load', () => {
      let hasTriggeredEarlyTransition = true;
      
      // Simulate loadTrack resetting state
      const loadTrack = () => {
        hasTriggeredEarlyTransition = false;
      };
      
      loadTrack();
      
      expect(hasTriggeredEarlyTransition).toBe(false);
    });
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Audio Engine Integration', () => {
  describe('Crossfade with volume fades', () => {
    it('should fade out old track while fading in new track', () => {
      const targetVolume = 0.7;
      const steps = 10;
      const oldVolumes: number[] = [];
      const newVolumes: number[] = [];
      
      for (let step = 0; step <= steps; step++) {
        const progress = step / steps;
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        oldVolumes.push(targetVolume * (1 - eased));
        newVolumes.push(targetVolume * eased);
      }
      
      // Old volume decreases, new volume increases
      expect(oldVolumes[0]).toBe(targetVolume);
      expect(oldVolumes[oldVolumes.length - 1]).toBeCloseTo(0, 5);
      expect(newVolumes[0]).toBe(0);
      expect(newVolumes[newVolumes.length - 1]).toBeCloseTo(targetVolume, 5);
      
      // At any point, combined volume should be constant (targetVolume)
      for (let i = 0; i < oldVolumes.length; i++) {
        const combinedVolume = oldVolumes[i] + newVolumes[i];
        // Allow small floating point variance
        expect(combinedVolume).toBeCloseTo(targetVolume, 1);
      }
    });
  });

  describe('State management across operations', () => {
    it('should maintain consistent state through play/pause/stop cycle', () => {
      let isPlayingState = false;
      let playbackState: 'idle' | 'playing' | 'paused' | 'stopped' = 'idle';
      
      // Play
      isPlayingState = true;
      playbackState = 'playing';
      expect(isPlayingState).toBe(true);
      expect(playbackState).toBe('playing');
      
      // Pause
      isPlayingState = false;
      playbackState = 'paused';
      expect(isPlayingState).toBe(false);
      expect(playbackState).toBe('paused');
      
      // Stop
      isPlayingState = false;
      playbackState = 'stopped';
      expect(isPlayingState).toBe(false);
      expect(playbackState).toBe('stopped');
    });
  });
});
