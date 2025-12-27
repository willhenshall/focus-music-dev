import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the playback loading state machine.
 * 
 * These tests verify:
 * 1. State transitions: idle → loading → playing
 * 2. RequestId uniqueness and stale request protection
 * 3. TTFA calculation
 * 4. Error timeout behavior
 */

// Mock the generateRequestId function behavior
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Simulate the loading state machine
type PlaybackLoadingStatus = 'idle' | 'loading' | 'playing' | 'error';

type PlaybackLoadingState = {
  status: PlaybackLoadingStatus;
  requestId?: string;
  channelId?: string;
  channelName?: string;
  energyLevel: 'low' | 'medium' | 'high';
  trackId?: string;
  trackName?: string;
  artistName?: string;
  startedAt?: number;
  triggerType?: 'channel_switch' | 'energy_change' | 'initial_play';
  ttfaMs?: number;
  errorMessage?: string;
};

// Simple state machine for testing
class PlaybackLoadingStateMachine {
  private state: PlaybackLoadingState = { status: 'idle', energyLevel: 'medium' };
  private activeRequestId: string | null = null;
  private ttfaFiredForRequest: string | null = null;
  private ttfaEvents: Array<{ requestId: string; ttfaMs: number }> = [];

  getState(): PlaybackLoadingState {
    return { ...this.state };
  }

  getActiveRequestId(): string | null {
    return this.activeRequestId;
  }

  getTTFAEvents(): Array<{ requestId: string; ttfaMs: number }> {
    return [...this.ttfaEvents];
  }

  startLoading(
    channelId: string,
    channelName: string,
    energyLevel: 'low' | 'medium' | 'high',
    triggerType: 'channel_switch' | 'energy_change' | 'initial_play'
  ): string {
    const requestId = generateRequestId();
    const now = Date.now();

    this.activeRequestId = requestId;
    this.ttfaFiredForRequest = null;

    this.state = {
      status: 'loading',
      requestId,
      channelId,
      channelName,
      energyLevel,
      startedAt: now,
      triggerType,
    };

    return requestId;
  }

  completeLoading(requestId: string): boolean {
    // Stale request protection
    if (this.activeRequestId !== requestId) {
      return false;
    }

    // Prevent duplicate TTFA fires
    if (this.ttfaFiredForRequest === requestId) {
      return false;
    }

    const now = Date.now();
    const startedAt = this.state.startedAt;
    const ttfaMs = startedAt ? now - startedAt : 0;

    this.ttfaFiredForRequest = requestId;

    // Record TTFA event
    this.ttfaEvents.push({ requestId, ttfaMs });

    this.state = {
      ...this.state,
      status: 'playing',
      ttfaMs,
    };

    // Clear active request after completion
    setTimeout(() => {
      if (this.activeRequestId === requestId) {
        this.state = { status: 'idle', energyLevel: 'medium' };
        this.activeRequestId = null;
      }
    }, 100);

    return true;
  }

  updateTrackInfo(trackId: string, trackName: string, artistName: string): void {
    if (this.state.status !== 'loading') return;
    
    this.state = {
      ...this.state,
      trackId,
      trackName,
      artistName,
    };
  }

  reset(): void {
    this.state = { status: 'idle', energyLevel: 'medium' };
    this.activeRequestId = null;
    this.ttfaFiredForRequest = null;
    this.ttfaEvents = [];
  }
}

describe('PlaybackLoadingStateMachine', () => {
  let stateMachine: PlaybackLoadingStateMachine;

  beforeEach(() => {
    stateMachine = new PlaybackLoadingStateMachine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('State Transitions', () => {
    it('should start in idle state', () => {
      const state = stateMachine.getState();
      expect(state.status).toBe('idle');
      expect(state.energyLevel).toBe('medium');
    });

    it('should transition from idle to loading on startLoading (toggleChannel)', () => {
      const requestId = stateMachine.startLoading(
        'channel-1',
        'Focus Flow',
        'medium',
        'channel_switch'
      );

      const state = stateMachine.getState();
      expect(state.status).toBe('loading');
      expect(state.requestId).toBe(requestId);
      expect(state.channelId).toBe('channel-1');
      expect(state.channelName).toBe('Focus Flow');
      expect(state.energyLevel).toBe('medium');
      expect(state.triggerType).toBe('channel_switch');
      expect(state.startedAt).toBeDefined();
    });

    it('should transition from idle to loading on startLoading (setChannelEnergy)', () => {
      const requestId = stateMachine.startLoading(
        'channel-1',
        'Deep Work',
        'high',
        'energy_change'
      );

      const state = stateMachine.getState();
      expect(state.status).toBe('loading');
      expect(state.energyLevel).toBe('high');
      expect(state.triggerType).toBe('energy_change');
    });

    it('should transition from loading to playing when first audio is detected', () => {
      const requestId = stateMachine.startLoading(
        'channel-1',
        'Focus Flow',
        'medium',
        'channel_switch'
      );

      // Simulate some time passing
      vi.advanceTimersByTime(500);

      const completed = stateMachine.completeLoading(requestId);
      expect(completed).toBe(true);

      const state = stateMachine.getState();
      expect(state.status).toBe('playing');
      expect(state.ttfaMs).toBe(500);
    });

    it('should transition back to idle after playing state settles', () => {
      const requestId = stateMachine.startLoading(
        'channel-1',
        'Focus Flow',
        'medium',
        'channel_switch'
      );

      stateMachine.completeLoading(requestId);

      // Wait for the timeout to clear
      vi.advanceTimersByTime(150);

      const state = stateMachine.getState();
      expect(state.status).toBe('idle');
    });
  });

  describe('RequestId and Stale Request Protection', () => {
    it('should generate unique requestIds for each load attempt', () => {
      const requestId1 = stateMachine.startLoading(
        'channel-1',
        'Focus Flow',
        'medium',
        'channel_switch'
      );
      
      const requestId2 = stateMachine.startLoading(
        'channel-2',
        'Deep Work',
        'high',
        'channel_switch'
      );

      expect(requestId1).not.toBe(requestId2);
    });

    it('should NOT complete loading for a stale requestId', () => {
      const staleRequestId = stateMachine.startLoading(
        'channel-1',
        'Focus Flow',
        'medium',
        'channel_switch'
      );

      // User switches channel again (new request supersedes the old one)
      const currentRequestId = stateMachine.startLoading(
        'channel-2',
        'Deep Work',
        'high',
        'channel_switch'
      );

      vi.advanceTimersByTime(200);

      // Try to complete with the stale requestId
      const staleCompleted = stateMachine.completeLoading(staleRequestId);
      expect(staleCompleted).toBe(false);

      // State should still be loading (for the current request)
      expect(stateMachine.getState().status).toBe('loading');
      expect(stateMachine.getState().channelName).toBe('Deep Work');
    });

    it('should only accept completion from the active requestId', () => {
      stateMachine.startLoading('channel-1', 'Focus Flow', 'medium', 'channel_switch');
      stateMachine.startLoading('channel-2', 'Deep Work', 'high', 'channel_switch');
      const finalRequestId = stateMachine.startLoading(
        'channel-3',
        'Creative',
        'low',
        'channel_switch'
      );

      vi.advanceTimersByTime(300);

      const completed = stateMachine.completeLoading(finalRequestId);
      expect(completed).toBe(true);
      expect(stateMachine.getState().channelName).toBe('Creative');
    });
  });

  describe('TTFA (Time To First Audio)', () => {
    it('should calculate TTFA correctly', () => {
      const requestId = stateMachine.startLoading(
        'channel-1',
        'Focus Flow',
        'medium',
        'channel_switch'
      );

      vi.advanceTimersByTime(750);

      stateMachine.completeLoading(requestId);

      const state = stateMachine.getState();
      expect(state.ttfaMs).toBe(750);
    });

    it('should fire TTFA event exactly once per requestId', () => {
      const requestId = stateMachine.startLoading(
        'channel-1',
        'Focus Flow',
        'medium',
        'channel_switch'
      );

      vi.advanceTimersByTime(500);

      // First completion should succeed
      const first = stateMachine.completeLoading(requestId);
      expect(first).toBe(true);

      // Second completion should be rejected
      const second = stateMachine.completeLoading(requestId);
      expect(second).toBe(false);

      // Should only have one TTFA event
      const events = stateMachine.getTTFAEvents();
      expect(events).toHaveLength(1);
      expect(events[0].requestId).toBe(requestId);
      expect(events[0].ttfaMs).toBe(500);
    });

    it('should NOT fire TTFA for stale requests', () => {
      const staleRequestId = stateMachine.startLoading(
        'channel-1',
        'Focus Flow',
        'medium',
        'channel_switch'
      );

      const currentRequestId = stateMachine.startLoading(
        'channel-2',
        'Deep Work',
        'high',
        'channel_switch'
      );

      vi.advanceTimersByTime(500);

      // Try to complete stale request
      stateMachine.completeLoading(staleRequestId);

      // Complete current request
      stateMachine.completeLoading(currentRequestId);

      // Should only have TTFA for current request
      const events = stateMachine.getTTFAEvents();
      expect(events).toHaveLength(1);
      expect(events[0].requestId).toBe(currentRequestId);
    });
  });

  describe('Track Info Updates', () => {
    it('should update track info when in loading state', () => {
      stateMachine.startLoading('channel-1', 'Focus Flow', 'medium', 'channel_switch');

      stateMachine.updateTrackInfo('track-123', 'Ambient Dreams', 'Sonic Artist');

      const state = stateMachine.getState();
      expect(state.trackId).toBe('track-123');
      expect(state.trackName).toBe('Ambient Dreams');
      expect(state.artistName).toBe('Sonic Artist');
    });

    it('should NOT update track info when not in loading state', () => {
      // State is idle
      stateMachine.updateTrackInfo('track-123', 'Ambient Dreams', 'Sonic Artist');

      const state = stateMachine.getState();
      expect(state.trackId).toBeUndefined();
      expect(state.trackName).toBeUndefined();
    });
  });

  describe('Rapid Switching (Race Conditions)', () => {
    it('should handle rapid channel switches correctly', () => {
      // User rapidly switches between 5 channels
      stateMachine.startLoading('ch-1', 'Channel 1', 'low', 'channel_switch');
      vi.advanceTimersByTime(50);
      
      stateMachine.startLoading('ch-2', 'Channel 2', 'medium', 'channel_switch');
      vi.advanceTimersByTime(50);
      
      stateMachine.startLoading('ch-3', 'Channel 3', 'high', 'channel_switch');
      vi.advanceTimersByTime(50);
      
      stateMachine.startLoading('ch-4', 'Channel 4', 'low', 'channel_switch');
      vi.advanceTimersByTime(50);
      
      const finalRequestId = stateMachine.startLoading(
        'ch-5',
        'Channel 5',
        'medium',
        'channel_switch'
      );

      // State should reflect only the final request
      expect(stateMachine.getState().channelName).toBe('Channel 5');
      expect(stateMachine.getActiveRequestId()).toBe(finalRequestId);
    });

    it('should handle rapid energy level changes correctly', () => {
      stateMachine.startLoading('ch-1', 'Focus Flow', 'low', 'energy_change');
      vi.advanceTimersByTime(30);
      
      stateMachine.startLoading('ch-1', 'Focus Flow', 'medium', 'energy_change');
      vi.advanceTimersByTime(30);
      
      const finalRequestId = stateMachine.startLoading(
        'ch-1',
        'Focus Flow',
        'high',
        'energy_change'
      );

      // State should reflect only the final energy level
      expect(stateMachine.getState().energyLevel).toBe('high');
      expect(stateMachine.getActiveRequestId()).toBe(finalRequestId);
    });

    it('should dismiss modal only for the final request in rapid switching', () => {
      const req1 = stateMachine.startLoading('ch-1', 'Channel 1', 'low', 'channel_switch');
      const req2 = stateMachine.startLoading('ch-2', 'Channel 2', 'medium', 'channel_switch');
      const req3 = stateMachine.startLoading('ch-3', 'Channel 3', 'high', 'channel_switch');

      vi.advanceTimersByTime(500);

      // Try to complete stale requests
      expect(stateMachine.completeLoading(req1)).toBe(false);
      expect(stateMachine.completeLoading(req2)).toBe(false);
      
      // Complete the final request
      expect(stateMachine.completeLoading(req3)).toBe(true);
      
      expect(stateMachine.getState().status).toBe('playing');
      expect(stateMachine.getState().channelName).toBe('Channel 3');
    });
  });
});

/**
 * Tests for first audible audio detection helper.
 * Simulates the criteria check across multiple audio elements.
 * 
 * Key behavior: detection must IGNORE old audio sources and only
 * complete when a NEW track starts playing.
 */
describe('FirstAudibleAudioDetection', () => {
  type MockAudioElement = {
    src: string;
    paused: boolean;
    currentTime: number;
    readyState: number;
    volume: number;
    muted: boolean;
  };

  /**
   * Check if any NEW audio element meets "first audible" criteria:
   * - audio.src NOT in oldSources (must be a new track)
   * - audio.paused === false
   * - audio.currentTime >= 0.05
   * - audio.readyState >= HAVE_CURRENT_DATA (2)
   * - audio.volume > 0 && !audio.muted
   */
  function checkForNewAudioPlaying(
    audioElements: MockAudioElement[],
    oldSources: Set<string>
  ): MockAudioElement | null {
    for (const audio of audioElements) {
      // Skip if this is an old source
      if (oldSources.has(audio.src)) {
        continue;
      }
      
      if (!audio.src) continue;
      
      const isPlaying = !audio.paused;
      const hasPlayedEnough = audio.currentTime >= 0.05;
      const hasBuffer = audio.readyState >= 2;
      const isAudible = audio.volume > 0 && !audio.muted;
      
      if (isPlaying && hasPlayedEnough && hasBuffer && isAudible) {
        return audio;
      }
    }
    return null;
  }

  // Legacy function for backward compatibility in existing tests
  function checkAudioElements(audioElements: Array<{
    paused: boolean;
    currentTime: number;
    readyState: number;
  }>): boolean {
    for (const audio of audioElements) {
      if (!audio.paused && audio.currentTime >= 0.05 && audio.readyState >= 2) {
        return true;
      }
    }
    return false;
  }

  describe('Single Audio Element', () => {
    it('should detect when single audio is playing', () => {
      const audioElements = [
        { paused: false, currentTime: 0.1, readyState: 4 }
      ];
      expect(checkAudioElements(audioElements)).toBe(true);
    });

    it('should not detect when audio is paused', () => {
      const audioElements = [
        { paused: true, currentTime: 0.1, readyState: 4 }
      ];
      expect(checkAudioElements(audioElements)).toBe(false);
    });

    it('should not detect when currentTime is too low', () => {
      const audioElements = [
        { paused: false, currentTime: 0.01, readyState: 4 }
      ];
      expect(checkAudioElements(audioElements)).toBe(false);
    });

    it('should not detect when readyState is too low', () => {
      const audioElements = [
        { paused: false, currentTime: 0.1, readyState: 1 }
      ];
      expect(checkAudioElements(audioElements)).toBe(false);
    });
  });

  describe('Dual Audio Elements (Crossfade)', () => {
    it('should detect when primary audio is playing (secondary paused)', () => {
      const audioElements = [
        { paused: false, currentTime: 0.5, readyState: 4 },  // PRIMARY playing
        { paused: true, currentTime: 0, readyState: 0 }      // SECONDARY idle
      ];
      expect(checkAudioElements(audioElements)).toBe(true);
    });

    it('should detect when secondary audio is playing (primary paused)', () => {
      const audioElements = [
        { paused: true, currentTime: 10.5, readyState: 4 },  // PRIMARY paused (old track)
        { paused: false, currentTime: 0.1, readyState: 4 }   // SECONDARY playing (new track)
      ];
      expect(checkAudioElements(audioElements)).toBe(true);
    });

    it('should detect during crossfade when both are playing', () => {
      const audioElements = [
        { paused: false, currentTime: 55.0, readyState: 4 },  // PRIMARY fading out
        { paused: false, currentTime: 0.1, readyState: 4 }    // SECONDARY fading in
      ];
      expect(checkAudioElements(audioElements)).toBe(true);
    });

    it('should not detect when both audio elements are loading', () => {
      const audioElements = [
        { paused: true, currentTime: 0, readyState: 1 },  // PRIMARY loading
        { paused: true, currentTime: 0, readyState: 1 }   // SECONDARY loading
      ];
      expect(checkAudioElements(audioElements)).toBe(false);
    });

    it('should not detect when new track just started (currentTime < 0.05)', () => {
      const audioElements = [
        { paused: true, currentTime: 58.0, readyState: 4 },   // PRIMARY paused (old track done)
        { paused: false, currentTime: 0.02, readyState: 4 }   // SECONDARY just started
      ];
      expect(checkAudioElements(audioElements)).toBe(false);
    });

    it('should detect once currentTime crosses 0.05 threshold', () => {
      const audioElements = [
        { paused: true, currentTime: 58.0, readyState: 4 },   // PRIMARY paused
        { paused: false, currentTime: 0.05, readyState: 4 }   // SECONDARY at threshold
      ];
      expect(checkAudioElements(audioElements)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty audio elements array', () => {
      expect(checkAudioElements([])).toBe(false);
    });

    it('should handle many audio elements', () => {
      const audioElements = [
        { paused: true, currentTime: 0, readyState: 0 },
        { paused: true, currentTime: 0, readyState: 0 },
        { paused: true, currentTime: 0, readyState: 0 },
        { paused: false, currentTime: 1.0, readyState: 4 },  // This one is playing
        { paused: true, currentTime: 0, readyState: 0 },
      ];
      expect(checkAudioElements(audioElements)).toBe(true);
    });

    it('should use readyState 2 (HAVE_CURRENT_DATA) as minimum', () => {
      // readyState 2 should pass
      expect(checkAudioElements([
        { paused: false, currentTime: 0.1, readyState: 2 }
      ])).toBe(true);

      // readyState 1 should fail
      expect(checkAudioElements([
        { paused: false, currentTime: 0.1, readyState: 1 }
      ])).toBe(false);
    });
  });

  describe('Old Source Ignoring (Channel/Energy Switch)', () => {
    const oldTrackSrc = 'https://cdn.example.com/tracks/old-track.mp3';
    const newTrackSrc = 'https://cdn.example.com/tracks/new-track.mp3';
    
    it('should NOT detect when only old source is playing', () => {
      const oldSources = new Set([oldTrackSrc]);
      const audioElements: MockAudioElement[] = [
        { src: oldTrackSrc, paused: false, currentTime: 30.0, readyState: 4, volume: 1, muted: false },
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).toBeNull();
    });

    it('should detect when new source is playing', () => {
      const oldSources = new Set([oldTrackSrc]);
      const audioElements: MockAudioElement[] = [
        { src: oldTrackSrc, paused: true, currentTime: 58.0, readyState: 4, volume: 1, muted: false },  // Old track paused
        { src: newTrackSrc, paused: false, currentTime: 0.1, readyState: 4, volume: 1, muted: false },  // New track playing
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(newTrackSrc);
    });

    it('should NOT detect when old source is playing and new source is buffering', () => {
      const oldSources = new Set([oldTrackSrc]);
      const audioElements: MockAudioElement[] = [
        { src: oldTrackSrc, paused: false, currentTime: 55.0, readyState: 4, volume: 1, muted: false },  // Old still playing
        { src: newTrackSrc, paused: true, currentTime: 0, readyState: 1, volume: 1, muted: false },      // New buffering
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).toBeNull();
    });

    it('should detect during crossfade when new track reaches 0.05s', () => {
      const oldSources = new Set([oldTrackSrc]);
      const audioElements: MockAudioElement[] = [
        { src: oldTrackSrc, paused: false, currentTime: 58.0, readyState: 4, volume: 0.3, muted: false },  // Old fading out
        { src: newTrackSrc, paused: false, currentTime: 0.05, readyState: 4, volume: 0.7, muted: false },  // New fading in
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(newTrackSrc);
    });

    it('should NOT detect when new track just started (currentTime < 0.05)', () => {
      const oldSources = new Set([oldTrackSrc]);
      const audioElements: MockAudioElement[] = [
        { src: oldTrackSrc, paused: true, currentTime: 60.0, readyState: 4, volume: 0, muted: false },
        { src: newTrackSrc, paused: false, currentTime: 0.02, readyState: 4, volume: 1, muted: false },  // Just started
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).toBeNull();
    });

    it('should NOT detect when new track is muted', () => {
      const oldSources = new Set([oldTrackSrc]);
      const audioElements: MockAudioElement[] = [
        { src: newTrackSrc, paused: false, currentTime: 0.5, readyState: 4, volume: 1, muted: true },
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).toBeNull();
    });

    it('should NOT detect when new track volume is 0', () => {
      const oldSources = new Set([oldTrackSrc]);
      const audioElements: MockAudioElement[] = [
        { src: newTrackSrc, paused: false, currentTime: 0.5, readyState: 4, volume: 0, muted: false },
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).toBeNull();
    });

    it('should handle empty oldSources (initial play)', () => {
      const oldSources = new Set<string>();  // No old sources on initial play
      const audioElements: MockAudioElement[] = [
        { src: newTrackSrc, paused: false, currentTime: 0.1, readyState: 4, volume: 1, muted: false },
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).not.toBeNull();
    });

    it('should handle multiple old sources (edge case)', () => {
      const oldSrc1 = 'https://cdn.example.com/tracks/old1.mp3';
      const oldSrc2 = 'https://cdn.example.com/tracks/old2.mp3';
      const oldSources = new Set([oldSrc1, oldSrc2]);
      
      const audioElements: MockAudioElement[] = [
        { src: oldSrc1, paused: false, currentTime: 10.0, readyState: 4, volume: 1, muted: false },
        { src: oldSrc2, paused: false, currentTime: 5.0, readyState: 4, volume: 1, muted: false },
        { src: newTrackSrc, paused: false, currentTime: 0.1, readyState: 4, volume: 1, muted: false },
      ];
      
      const result = checkForNewAudioPlaying(audioElements, oldSources);
      expect(result).not.toBeNull();
      expect(result?.src).toBe(newTrackSrc);
    });
  });
});

/**
 * Tests for minimum visible duration (calm ritual transition).
 * Modal must remain visible for at least MIN_MODAL_VISIBLE_MS (4000ms).
 */
describe('MinimumVisibleDuration', () => {
  const MIN_MODAL_VISIBLE_MS = 4000;

  // Simulates the complete loading logic with min visible duration
  class MinVisibleStateMachine {
    private status: 'idle' | 'loading' | 'playing' = 'idle';
    private startedAt: number = 0;
    private firstAudibleAt: number | null = null;
    private activeRequestId: string | null = null;
    private pendingDismissTimeout: ReturnType<typeof setTimeout> | null = null;
    private dismissedAt: number | null = null;

    getStatus() { return this.status; }
    getDismissedAt() { return this.dismissedAt; }
    getActiveRequestId() { return this.activeRequestId; }

    startLoading(requestId: string) {
      // Cancel any pending dismiss from previous request
      if (this.pendingDismissTimeout) {
        clearTimeout(this.pendingDismissTimeout);
        this.pendingDismissTimeout = null;
      }
      
      this.status = 'loading';
      this.startedAt = Date.now();
      this.firstAudibleAt = null;
      this.activeRequestId = requestId;
      this.dismissedAt = null;
    }

    completeLoading(requestId: string, now: number = Date.now()): { immediate: boolean; delayMs?: number } {
      // Stale request protection
      if (this.activeRequestId !== requestId) {
        return { immediate: false };
      }

      // Already detected
      if (this.firstAudibleAt !== null) {
        return { immediate: false };
      }

      this.firstAudibleAt = now;
      const elapsedMs = now - this.startedAt;

      if (elapsedMs >= MIN_MODAL_VISIBLE_MS) {
        // Dismiss immediately
        this.dismiss(requestId, now);
        return { immediate: true };
      } else {
        // Schedule delayed dismiss
        const remainingMs = MIN_MODAL_VISIBLE_MS - elapsedMs;
        this.pendingDismissTimeout = setTimeout(() => {
          if (this.activeRequestId === requestId) {
            this.dismiss(requestId, Date.now());
          }
          this.pendingDismissTimeout = null;
        }, remainingMs);
        return { immediate: false, delayMs: remainingMs };
      }
    }

    dismiss(requestId: string, now: number) {
      if (this.activeRequestId !== requestId) return;
      this.status = 'playing';
      this.dismissedAt = now;
    }

    cancelPendingDismiss() {
      if (this.pendingDismissTimeout) {
        clearTimeout(this.pendingDismissTimeout);
        this.pendingDismissTimeout = null;
      }
    }
  }

  let machine: MinVisibleStateMachine;

  beforeEach(() => {
    machine = new MinVisibleStateMachine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    machine.cancelPendingDismiss();
    vi.useRealTimers();
  });

  it('should dismiss immediately if first audio occurs after MIN_MODAL_VISIBLE_MS', () => {
    machine.startLoading('req-1');
    
    // Simulate 4500ms passing (> 4000ms min)
    vi.advanceTimersByTime(4500);
    const now = Date.now();
    
    const result = machine.completeLoading('req-1', now);
    
    expect(result.immediate).toBe(true);
    expect(machine.getStatus()).toBe('playing');
  });

  it('should delay dismiss if first audio occurs before MIN_MODAL_VISIBLE_MS', () => {
    machine.startLoading('req-1');
    
    // Simulate 1500ms passing (< 4000ms min)
    vi.advanceTimersByTime(1500);
    const now = Date.now();
    
    const result = machine.completeLoading('req-1', now);
    
    expect(result.immediate).toBe(false);
    expect(result.delayMs).toBe(2500); // 4000 - 1500 = 2500ms remaining
    expect(machine.getStatus()).toBe('loading'); // Still loading
    
    // Advance remaining time
    vi.advanceTimersByTime(2500);
    
    expect(machine.getStatus()).toBe('playing'); // Now dismissed
  });

  it('should wait exactly until MIN_MODAL_VISIBLE_MS elapsed from start', () => {
    machine.startLoading('req-1');
    
    // First audio at 100ms
    vi.advanceTimersByTime(100);
    const firstAudioTime = Date.now();
    machine.completeLoading('req-1', firstAudioTime);
    
    expect(machine.getStatus()).toBe('loading');
    
    // At 3999ms - should still be loading
    vi.advanceTimersByTime(3899);
    expect(machine.getStatus()).toBe('loading');
    
    // At 4000ms - should dismiss
    vi.advanceTimersByTime(1);
    expect(machine.getStatus()).toBe('playing');
  });

  it('should cancel pending dismiss when new request starts', () => {
    machine.startLoading('req-1');
    
    // First audio at 1000ms, schedules dismiss for 3000ms later (4000-1000=3000)
    vi.advanceTimersByTime(1000);
    machine.completeLoading('req-1', Date.now());
    
    expect(machine.getStatus()).toBe('loading');
    
    // New request at 1500ms (before req-1 would dismiss at 4000ms)
    vi.advanceTimersByTime(500);
    machine.startLoading('req-2');
    
    // Original dismiss time passes (would be at 4000ms from original start)
    vi.advanceTimersByTime(2500);
    
    // Should still be loading (req-2), not dismissed by stale req-1 timeout
    expect(machine.getStatus()).toBe('loading');
    expect(machine.getActiveRequestId()).toBe('req-2');
  });

  it('should not dismiss for stale requestId', () => {
    machine.startLoading('req-1');
    vi.advanceTimersByTime(4500);
    
    // Try to complete with wrong requestId
    machine.startLoading('req-2'); // New request supersedes
    
    const result = machine.completeLoading('req-1', Date.now());
    
    expect(result.immediate).toBe(false);
    expect(machine.getStatus()).toBe('loading'); // Still loading for req-2
  });

  it('should handle rapid switching with no orphan timers', () => {
    // Rapid switching simulation
    machine.startLoading('req-1');
    vi.advanceTimersByTime(50);
    machine.completeLoading('req-1', Date.now());
    
    machine.startLoading('req-2');
    vi.advanceTimersByTime(50);
    machine.completeLoading('req-2', Date.now());
    
    machine.startLoading('req-3');
    vi.advanceTimersByTime(50);
    machine.completeLoading('req-3', Date.now());
    
    // Advance past all potential timers (need to pass MIN_MODAL_VISIBLE_MS = 4000ms)
    vi.advanceTimersByTime(4000);
    
    // Only the final request should have dismissed
    expect(machine.getStatus()).toBe('playing');
    expect(machine.getActiveRequestId()).toBe('req-3');
  });

  it('should dismiss at exactly MIN_MODAL_VISIBLE_MS when audio detected at t=0', () => {
    machine.startLoading('req-1');
    
    // First audio immediately (0ms)
    const startTime = Date.now();
    const result = machine.completeLoading('req-1', startTime);
    
    expect(result.immediate).toBe(false);
    expect(result.delayMs).toBe(4000);
    expect(machine.getStatus()).toBe('loading');
    
    // Wait exactly 4000ms
    vi.advanceTimersByTime(4000);
    expect(machine.getStatus()).toBe('playing');
  });
});

/**
 * Tests for fade-out animation race condition safety.
 * New request during fade-out should cancel fade and show modal immediately.
 */
describe('FadeOutRaceConditionSafety', () => {
  const FADE_OUT_MS = 450; // Slower fade-out for smoother transition

  class FadeStateMachine {
    private isVisible: boolean = false;
    private isFadingOut: boolean = false;
    private activeRequestId: string | null = null;
    private fadeOutTimeout: ReturnType<typeof setTimeout> | null = null;

    getIsVisible() { return this.isVisible; }
    getIsFadingOut() { return this.isFadingOut; }
    getActiveRequestId() { return this.activeRequestId; }

    startLoading(requestId: string) {
      // Cancel any fade-out in progress
      if (this.fadeOutTimeout) {
        clearTimeout(this.fadeOutTimeout);
        this.fadeOutTimeout = null;
      }
      
      // Show immediately, cancel any fade-out
      this.isFadingOut = false;
      this.isVisible = true;
      this.activeRequestId = requestId;
    }

    dismiss(requestId: string) {
      // Only dismiss if this is the active request
      if (this.activeRequestId !== requestId) return;
      
      // Start fade-out
      this.isFadingOut = true;
      
      this.fadeOutTimeout = setTimeout(() => {
        // Only complete fade-out if still fading out (not cancelled)
        if (this.isFadingOut && this.activeRequestId === requestId) {
          this.isVisible = false;
          this.isFadingOut = false;
          this.activeRequestId = null;
        }
        this.fadeOutTimeout = null;
      }, FADE_OUT_MS);
    }

    cleanup() {
      if (this.fadeOutTimeout) {
        clearTimeout(this.fadeOutTimeout);
        this.fadeOutTimeout = null;
      }
    }
  }

  let machine: FadeStateMachine;

  beforeEach(() => {
    machine = new FadeStateMachine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    machine.cleanup();
    vi.useRealTimers();
  });

  it('should cancel fade-out when new request starts during fade', () => {
    // Start first request
    machine.startLoading('req-1');
    expect(machine.getIsVisible()).toBe(true);
    expect(machine.getIsFadingOut()).toBe(false);
    
    // Dismiss (start fade-out)
    machine.dismiss('req-1');
    expect(machine.getIsFadingOut()).toBe(true);
    expect(machine.getIsVisible()).toBe(true); // Still visible during fade
    
    // New request during fade-out
    vi.advanceTimersByTime(100); // Partway through fade
    machine.startLoading('req-2');
    
    // Fade should be cancelled, modal visible immediately
    expect(machine.getIsFadingOut()).toBe(false);
    expect(machine.getIsVisible()).toBe(true);
    expect(machine.getActiveRequestId()).toBe('req-2');
    
    // Original fade-out should not complete
    vi.advanceTimersByTime(200); // Past original fade time
    expect(machine.getIsVisible()).toBe(true);
    expect(machine.getActiveRequestId()).toBe('req-2');
  });

  it('should complete fade-out if no new request', () => {
    machine.startLoading('req-1');
    machine.dismiss('req-1');
    
    expect(machine.getIsFadingOut()).toBe(true);
    expect(machine.getIsVisible()).toBe(true);
    
    // Complete fade-out
    vi.advanceTimersByTime(FADE_OUT_MS);
    
    expect(machine.getIsVisible()).toBe(false);
    expect(machine.getIsFadingOut()).toBe(false);
    expect(machine.getActiveRequestId()).toBeNull();
  });

  it('should not allow stale dismiss to affect new request', () => {
    machine.startLoading('req-1');
    machine.startLoading('req-2'); // Supersede immediately
    
    // Try to dismiss with stale requestId
    machine.dismiss('req-1');
    
    // Should not affect req-2
    expect(machine.getIsFadingOut()).toBe(false);
    expect(machine.getIsVisible()).toBe(true);
    expect(machine.getActiveRequestId()).toBe('req-2');
    
    // Even after fade time
    vi.advanceTimersByTime(FADE_OUT_MS);
    expect(machine.getIsVisible()).toBe(true);
  });

  it('should indicate pointer-events-none during fade-out for click-through', () => {
    // This tests the concept that during fade-out, clicks should pass through
    machine.startLoading('req-1');
    expect(machine.getIsFadingOut()).toBe(false); // pointer-events: auto
    
    machine.dismiss('req-1');
    expect(machine.getIsFadingOut()).toBe(true); // pointer-events: none
    expect(machine.getIsVisible()).toBe(true); // Still visible but not blocking
    
    // Complete fade-out
    vi.advanceTimersByTime(FADE_OUT_MS);
    expect(machine.getIsVisible()).toBe(false); // Fully gone
  });
});

/**
 * Tests for ritual overlay behavior (non-blocking after audio starts).
 * Once first audible audio is detected, modal becomes non-blocking while still visible.
 */
describe('RitualOverlayBehavior', () => {
  const MIN_MODAL_VISIBLE_MS = 4000;

  class RitualOverlayStateMachine {
    private status: 'idle' | 'loading' | 'playing' = 'idle';
    private startedAt: number = 0;
    private audibleStarted: boolean = false;
    private activeRequestId: string | null = null;
    private pendingDismissTimeout: ReturnType<typeof setTimeout> | null = null;

    getStatus() { return this.status; }
    getAudibleStarted() { return this.audibleStarted; }
    getActiveRequestId() { return this.activeRequestId; }
    
    // Returns true if overlay should block clicks
    shouldBlockClicks(): boolean {
      // Block clicks only when loading AND audio hasn't started yet
      return this.status === 'loading' && !this.audibleStarted;
    }

    startLoading(requestId: string) {
      if (this.pendingDismissTimeout) {
        clearTimeout(this.pendingDismissTimeout);
        this.pendingDismissTimeout = null;
      }
      
      this.status = 'loading';
      this.startedAt = Date.now();
      this.audibleStarted = false;
      this.activeRequestId = requestId;
    }

    // Called when first audible audio is detected
    onFirstAudible(requestId: string, now: number = Date.now()): { immediate: boolean; delayMs?: number } {
      if (this.activeRequestId !== requestId) {
        return { immediate: false };
      }

      // Mark audio as started (modal becomes non-blocking)
      this.audibleStarted = true;
      
      const elapsedMs = now - this.startedAt;

      if (elapsedMs >= MIN_MODAL_VISIBLE_MS) {
        // Dismiss immediately
        this.status = 'playing';
        return { immediate: true };
      } else {
        // Schedule delayed dismiss
        const remainingMs = MIN_MODAL_VISIBLE_MS - elapsedMs;
        this.pendingDismissTimeout = setTimeout(() => {
          if (this.activeRequestId === requestId) {
            this.status = 'playing';
          }
          this.pendingDismissTimeout = null;
        }, remainingMs);
        return { immediate: false, delayMs: remainingMs };
      }
    }

    cleanup() {
      if (this.pendingDismissTimeout) {
        clearTimeout(this.pendingDismissTimeout);
        this.pendingDismissTimeout = null;
      }
    }
  }

  let machine: RitualOverlayStateMachine;

  beforeEach(() => {
    machine = new RitualOverlayStateMachine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    machine.cleanup();
    vi.useRealTimers();
  });

  it('should block clicks before first audible audio', () => {
    machine.startLoading('req-1');
    
    expect(machine.shouldBlockClicks()).toBe(true);
    expect(machine.getAudibleStarted()).toBe(false);
  });

  it('should NOT block clicks after first audible audio (ritual overlay mode)', () => {
    machine.startLoading('req-1');
    expect(machine.shouldBlockClicks()).toBe(true);
    
    // Audio starts at 1000ms (before min visible)
    vi.advanceTimersByTime(1000);
    machine.onFirstAudible('req-1', Date.now());
    
    // Now in ritual overlay mode - clicks should pass through
    expect(machine.shouldBlockClicks()).toBe(false);
    expect(machine.getAudibleStarted()).toBe(true);
    expect(machine.getStatus()).toBe('loading'); // Still "loading" (visible) but non-blocking
  });

  it('should remain non-blocking until min visible time then dismiss', () => {
    machine.startLoading('req-1');
    
    // Audio starts at 1000ms
    vi.advanceTimersByTime(1000);
    machine.onFirstAudible('req-1', Date.now());
    
    expect(machine.shouldBlockClicks()).toBe(false);
    expect(machine.getStatus()).toBe('loading');
    
    // At 3999ms - still visible but non-blocking
    vi.advanceTimersByTime(2999);
    expect(machine.getStatus()).toBe('loading');
    expect(machine.shouldBlockClicks()).toBe(false);
    
    // At 4000ms - dismiss
    vi.advanceTimersByTime(1);
    expect(machine.getStatus()).toBe('playing');
  });

  it('should dismiss immediately if audio starts after min visible time', () => {
    machine.startLoading('req-1');
    
    // Audio starts at 4500ms (after min visible)
    vi.advanceTimersByTime(4500);
    const result = machine.onFirstAudible('req-1', Date.now());
    
    expect(result.immediate).toBe(true);
    expect(machine.getStatus()).toBe('playing');
    expect(machine.getAudibleStarted()).toBe(true);
  });

  it('should reset audibleStarted on new request', () => {
    machine.startLoading('req-1');
    vi.advanceTimersByTime(1000);
    machine.onFirstAudible('req-1', Date.now());
    
    expect(machine.getAudibleStarted()).toBe(true);
    
    // New request resets everything
    machine.startLoading('req-2');
    
    expect(machine.getAudibleStarted()).toBe(false);
    expect(machine.shouldBlockClicks()).toBe(true);
  });

  it('should not allow stale audible event to affect new request', () => {
    machine.startLoading('req-1');
    vi.advanceTimersByTime(500);
    
    // Supersede with new request before audible
    machine.startLoading('req-2');
    
    // Stale audible event for req-1
    const result = machine.onFirstAudible('req-1', Date.now());
    
    expect(result.immediate).toBe(false);
    expect(machine.getAudibleStarted()).toBe(false); // Should not be set
    expect(machine.shouldBlockClicks()).toBe(true); // Still blocking
  });
});

/**
 * Tests for channel image preloading.
 */
describe('ChannelImagePreloading', () => {
  class ImagePreloader {
    private preloadedUrls: Set<string> = new Set();
    private preloadCalls: string[] = [];

    getPreloadedUrls() { return this.preloadedUrls; }
    getPreloadCalls() { return this.preloadCalls; }

    preloadChannelImages(channels: Array<{ image_url?: string | null; channel_name: string }>) {
      channels.forEach(channel => {
        const imageUrl = channel.image_url;
        if (imageUrl && !this.preloadedUrls.has(imageUrl)) {
          this.preloadedUrls.add(imageUrl);
          this.preloadCalls.push(imageUrl);
          // In real implementation: new Image().src = imageUrl;
        }
      });
    }
  }

  let preloader: ImagePreloader;

  beforeEach(() => {
    preloader = new ImagePreloader();
  });

  it('should preload channel images on first call', () => {
    const channels = [
      { image_url: 'https://example.com/img1.jpg', channel_name: 'Channel 1' },
      { image_url: 'https://example.com/img2.jpg', channel_name: 'Channel 2' },
    ];

    preloader.preloadChannelImages(channels);

    expect(preloader.getPreloadCalls()).toHaveLength(2);
    expect(preloader.getPreloadedUrls().has('https://example.com/img1.jpg')).toBe(true);
    expect(preloader.getPreloadedUrls().has('https://example.com/img2.jpg')).toBe(true);
  });

  it('should NOT preload same image twice', () => {
    const channels1 = [
      { image_url: 'https://example.com/img1.jpg', channel_name: 'Channel 1' },
    ];
    const channels2 = [
      { image_url: 'https://example.com/img1.jpg', channel_name: 'Channel 1' }, // Same URL
      { image_url: 'https://example.com/img2.jpg', channel_name: 'Channel 2' }, // New URL
    ];

    preloader.preloadChannelImages(channels1);
    preloader.preloadChannelImages(channels2);

    // Should only have 2 calls total (img1 once, img2 once)
    expect(preloader.getPreloadCalls()).toHaveLength(2);
    expect(preloader.getPreloadCalls()).toEqual([
      'https://example.com/img1.jpg',
      'https://example.com/img2.jpg',
    ]);
  });

  it('should skip channels without image_url', () => {
    const channels = [
      { image_url: 'https://example.com/img1.jpg', channel_name: 'Channel 1' },
      { image_url: null, channel_name: 'Channel 2' },
      { image_url: undefined, channel_name: 'Channel 3' },
    ];

    preloader.preloadChannelImages(channels);

    expect(preloader.getPreloadCalls()).toHaveLength(1);
    expect(preloader.getPreloadCalls()[0]).toBe('https://example.com/img1.jpg');
  });

  it('should handle empty channel list', () => {
    preloader.preloadChannelImages([]);
    expect(preloader.getPreloadCalls()).toHaveLength(0);
  });
});

/**
 * Tests for error state and timeout behavior.
 */
describe('ErrorStateAndTimeout', () => {
  const MAX_LOADING_TIMEOUT_MS = 10000;

  class ErrorStateMachine {
    private status: 'idle' | 'loading' | 'playing' | 'error' = 'idle';
    private activeRequestId: string | null = null;
    private loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;
    private errorMessage: string | null = null;
    private errorReason: string | null = null;

    getStatus() { return this.status; }
    getErrorMessage() { return this.errorMessage; }
    getErrorReason() { return this.errorReason; }

    startLoading(requestId: string) {
      // Clear any existing timeout
      if (this.loadingTimeoutId) {
        clearTimeout(this.loadingTimeoutId);
        this.loadingTimeoutId = null;
      }
      
      this.status = 'loading';
      this.activeRequestId = requestId;
      this.errorMessage = null;
      this.errorReason = null;

      // Set timeout for error state
      this.loadingTimeoutId = setTimeout(() => {
        if (this.activeRequestId === requestId) {
          this.status = 'error';
          this.errorMessage = 'No track available for this channel/energy. Try another energy level.';
          this.errorReason = 'NO_TRACK_OR_AUDIO_TIMEOUT';
        }
        this.loadingTimeoutId = null;
      }, MAX_LOADING_TIMEOUT_MS);
    }

    completeLoading(requestId: string) {
      if (this.activeRequestId !== requestId) return false;
      if (this.loadingTimeoutId) {
        clearTimeout(this.loadingTimeoutId);
        this.loadingTimeoutId = null;
      }
      this.status = 'playing';
      return true;
    }

    dismissError() {
      if (this.status === 'error') {
        this.status = 'idle';
        this.activeRequestId = null;
        this.errorMessage = null;
        this.errorReason = null;
      }
    }

    cleanup() {
      if (this.loadingTimeoutId) {
        clearTimeout(this.loadingTimeoutId);
        this.loadingTimeoutId = null;
      }
    }
  }

  let machine: ErrorStateMachine;

  beforeEach(() => {
    machine = new ErrorStateMachine();
    vi.useFakeTimers();
  });

  afterEach(() => {
    machine.cleanup();
    vi.useRealTimers();
  });

  it('should transition to error state after MAX_LOADING_TIMEOUT_MS', () => {
    machine.startLoading('req-1');
    expect(machine.getStatus()).toBe('loading');
    
    // Just before timeout
    vi.advanceTimersByTime(MAX_LOADING_TIMEOUT_MS - 1);
    expect(machine.getStatus()).toBe('loading');
    
    // At timeout
    vi.advanceTimersByTime(1);
    expect(machine.getStatus()).toBe('error');
    expect(machine.getErrorReason()).toBe('NO_TRACK_OR_AUDIO_TIMEOUT');
    expect(machine.getErrorMessage()).toContain('No track available');
  });

  it('should not transition to error if audio completes before timeout', () => {
    machine.startLoading('req-1');
    
    vi.advanceTimersByTime(5000); // Half the timeout
    machine.completeLoading('req-1');
    
    expect(machine.getStatus()).toBe('playing');
    
    // Advance past timeout
    vi.advanceTimersByTime(10000);
    
    // Should still be playing, not error
    expect(machine.getStatus()).toBe('playing');
  });

  it('should allow user to dismiss error state', () => {
    machine.startLoading('req-1');
    vi.advanceTimersByTime(MAX_LOADING_TIMEOUT_MS);
    
    expect(machine.getStatus()).toBe('error');
    
    machine.dismissError();
    
    expect(machine.getStatus()).toBe('idle');
    expect(machine.getErrorMessage()).toBeNull();
  });

  it('should cancel old timeout when new request starts', () => {
    machine.startLoading('req-1');
    vi.advanceTimersByTime(5000);
    
    // New request resets timeout
    machine.startLoading('req-2');
    
    // Old timeout time passes
    vi.advanceTimersByTime(5000);
    expect(machine.getStatus()).toBe('loading'); // Still loading, not error
    
    // New timeout fires
    vi.advanceTimersByTime(5000);
    expect(machine.getStatus()).toBe('error');
  });

  it('should not allow error dismiss to affect new loading request', () => {
    machine.startLoading('req-1');
    vi.advanceTimersByTime(MAX_LOADING_TIMEOUT_MS);
    expect(machine.getStatus()).toBe('error');
    
    // Start new request before dismissing
    machine.startLoading('req-2');
    expect(machine.getStatus()).toBe('loading');
    
    // Old dismiss should not affect new request
    machine.dismissError();
    expect(machine.getStatus()).toBe('loading'); // Still loading, not dismissed
  });
});

/**
 * Tests for detection run prevention (no restart for same requestId).
 */
describe('DetectionRunPrevention', () => {
  let detectionRequestId: string | null = null;
  let detectionStartCount = 0;

  function resetDetection() {
    detectionRequestId = null;
    detectionStartCount = 0;
  }

  function startDetection(requestId: string): boolean {
    // Simulate the check that prevents duplicate detection runs
    if (detectionRequestId === requestId) {
      return false; // Already detecting for this requestId
    }
    detectionRequestId = requestId;
    detectionStartCount++;
    return true;
  }

  beforeEach(() => {
    resetDetection();
  });

  it('should start detection for new requestId', () => {
    const result = startDetection('req-1');
    expect(result).toBe(true);
    expect(detectionStartCount).toBe(1);
  });

  it('should NOT restart detection for same requestId', () => {
    startDetection('req-1');
    const result = startDetection('req-1');
    expect(result).toBe(false);
    expect(detectionStartCount).toBe(1);
  });

  it('should start detection for new requestId after previous', () => {
    startDetection('req-1');
    detectionRequestId = null; // Simulate cleanup
    const result = startDetection('req-2');
    expect(result).toBe(true);
    expect(detectionStartCount).toBe(2);
  });

  it('should allow detection for different requestId (superseding)', () => {
    startDetection('req-1');
    const result = startDetection('req-2'); // Different requestId supersedes
    expect(result).toBe(true);
    expect(detectionStartCount).toBe(2);
    expect(detectionRequestId).toBe('req-2');
  });
});

/**
 * Tests for channelImageUrl resolution in loading state.
 * The loading modal should show the channel image if available.
 * 
 * Priority order:
 * 1. Explicit channelImageUrl parameter (from call site using getChannelImage)
 * 2. channel.image_url fallback
 * 3. undefined (placeholder shown)
 */
describe('ChannelImageUrl Resolution', () => {
  type MockChannel = {
    id: string;
    channel_name: string;
    image_url: string | null;
  };

  type LoadingState = {
    channelImageUrl?: string;
    channelName?: string;
  };

  /**
   * Simulates the resolution logic in startPlaybackLoading:
   * const resolvedImageUrl = channelImageUrl || channel.image_url || undefined;
   */
  function resolveChannelImageUrl(
    channel: MockChannel,
    explicitImageUrl?: string
  ): string | undefined {
    return explicitImageUrl || channel.image_url || undefined;
  }

  /**
   * Simulates modal rendering logic:
   * If channelImageUrl exists → render <img>
   * Else → render placeholder
   */
  function shouldRenderImage(state: LoadingState): boolean {
    return !!state.channelImageUrl;
  }

  describe('Resolution Priority', () => {
    it('should use explicit channelImageUrl when provided', () => {
      const channel: MockChannel = {
        id: 'ch-1',
        channel_name: 'A.D.D.J.',
        image_url: null, // Newer channel has no image_url in channel record
      };
      const explicitImageUrl = 'https://cdn.example.com/images/addj.jpg'; // From image_set_images

      const result = resolveChannelImageUrl(channel, explicitImageUrl);
      expect(result).toBe(explicitImageUrl);
    });

    it('should fall back to channel.image_url when no explicit URL provided', () => {
      const channel: MockChannel = {
        id: 'ch-2',
        channel_name: 'Focus Flow',
        image_url: 'https://cdn.example.com/channels/focus-flow.jpg',
      };

      const result = resolveChannelImageUrl(channel, undefined);
      expect(result).toBe(channel.image_url);
    });

    it('should return undefined when neither explicit nor channel.image_url exists', () => {
      const channel: MockChannel = {
        id: 'ch-3',
        channel_name: 'New Channel',
        image_url: null,
      };

      const result = resolveChannelImageUrl(channel, undefined);
      expect(result).toBeUndefined();
    });

    it('should prefer explicit URL over channel.image_url', () => {
      const channel: MockChannel = {
        id: 'ch-4',
        channel_name: 'UltraDrone',
        image_url: 'https://cdn.example.com/old-image.jpg', // Old image in channel record
      };
      const explicitImageUrl = 'https://cdn.example.com/new-image.jpg'; // New image from image set

      const result = resolveChannelImageUrl(channel, explicitImageUrl);
      expect(result).toBe(explicitImageUrl);
    });
  });

  describe('Modal Rendering', () => {
    it('should render image when channelImageUrl is present in loading state', () => {
      const state: LoadingState = {
        channelName: 'A.D.D.J.',
        channelImageUrl: 'https://cdn.example.com/images/addj.jpg',
      };

      expect(shouldRenderImage(state)).toBe(true);
    });

    it('should render placeholder when channelImageUrl is undefined', () => {
      const state: LoadingState = {
        channelName: 'New Channel',
        channelImageUrl: undefined,
      };

      expect(shouldRenderImage(state)).toBe(false);
    });

    it('should render placeholder when channelImageUrl is empty string', () => {
      const state: LoadingState = {
        channelName: 'Test Channel',
        channelImageUrl: '',
      };

      expect(shouldRenderImage(state)).toBe(false);
    });
  });

  describe('Newer Channels (A.D.D.J., UltraDrone)', () => {
    it('should correctly resolve image for A.D.D.J. channel with image set', () => {
      // Simulates: channel record has no image_url, but image_set_images has the URL
      const addjChannel: MockChannel = {
        id: 'addj-uuid',
        channel_name: 'A.D.D.J.',
        image_url: null,
      };
      const imageFromImageSet = 'https://cdn.example.com/image-sets/default/addj.jpg';

      const result = resolveChannelImageUrl(addjChannel, imageFromImageSet);
      expect(result).toBe(imageFromImageSet);
      expect(shouldRenderImage({ channelImageUrl: result })).toBe(true);
    });

    it('should correctly resolve image for UltraDrone channel with image set', () => {
      // Simulates: channel record has no image_url, but image_set_images has the URL
      const ultradroneChannel: MockChannel = {
        id: 'ultradrone-uuid',
        channel_name: 'UltraDrone',
        image_url: null,
      };
      const imageFromImageSet = 'https://cdn.example.com/image-sets/default/ultradrone.jpg';

      const result = resolveChannelImageUrl(ultradroneChannel, imageFromImageSet);
      expect(result).toBe(imageFromImageSet);
      expect(shouldRenderImage({ channelImageUrl: result })).toBe(true);
    });
  });
});

