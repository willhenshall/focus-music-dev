/**
 * Unit tests for iOS Buffer Governor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  IosBufferGovernor, 
  BUFFER_GOVERNOR_CONFIG,
  getIosBufferGovernor,
  resetIosBufferGovernor,
} from '../iosBufferGovernor';

// Mock navigator for iOS detection
const mockNavigator = (ua: string, connection?: { type?: string; effectiveType?: string }) => {
  Object.defineProperty(global, 'navigator', {
    value: {
      userAgent: ua,
      platform: '',
      maxTouchPoints: 0,
      connection: connection || undefined,
    },
    writable: true,
    configurable: true,
  });
};

const mockIOSNavigator = () => {
  mockNavigator(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    { type: 'cellular', effectiveType: '4g' }
  );
};

const mockDesktopNavigator = () => {
  mockNavigator(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
  );
};

describe('IosBufferGovernor', () => {
  const originalNavigator = global.navigator;

  beforeEach(() => {
    resetIosBufferGovernor();
  });

  afterEach(() => {
    resetIosBufferGovernor();
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe('initialization', () => {
    it('should activate on iOS WebKit', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      expect(governor.isActive()).toBe(true);
      
      const state = governor.getState();
      expect(state.active).toBe(true);
      expect(state.iosInfo.isIOSWebKit).toBe(true);
    });

    it('should NOT activate on desktop browsers', () => {
      mockDesktopNavigator();
      const governor = new IosBufferGovernor();

      expect(governor.isActive()).toBe(false);
      
      const state = governor.getState();
      expect(state.active).toBe(false);
    });

    it('should set appropriate buffer limits on iOS cellular', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      const state = governor.getState();
      expect(state.limitBytes).toBeLessThanOrEqual(BUFFER_GOVERNOR_CONFIG.CELLULAR_BUFFER_LIMIT_BYTES);
    });
  });

  describe('prefetch control', () => {
    it('should allow prefetch on non-iOS platforms', () => {
      mockDesktopNavigator();
      const governor = new IosBufferGovernor();

      expect(governor.canPrefetch()).toBe(true);
      
      const state = governor.getState();
      expect(state.prefetch.allowed).toBe(true);
      expect(state.prefetch.reason).toBe('nonIOSPlatform');
    });

    it('should control prefetch on iOS based on buffer state', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Initially should be controlled based on buffer state
      const state = governor.getState();
      expect(state.prefetch.reason).not.toBe('nonIOSPlatform');
    });
  });

  describe('track size management', () => {
    it('should identify large tracks', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set a large track size (50MB)
      governor.setTrackSize(50 * 1024 * 1024);

      const state = governor.getState();
      expect(state.isLargeTrack).toBe(true);
      expect(state.estimatedTrackSizeBytes).toBe(50 * 1024 * 1024);
    });

    it('should NOT identify small tracks as large', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set a small track size (5MB)
      governor.setTrackSize(5 * 1024 * 1024);

      const state = governor.getState();
      expect(state.isLargeTrack).toBe(false);
    });
  });

  describe('resetForNewTrack', () => {
    it('should reset recovery state', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Simulate some state
      governor._simulateBufferFailure();
      
      // Reset
      governor.resetForNewTrack();

      const state = governor.getState();
      expect(state.recovery.attempts).toBe(0);
      expect(state.recovery.errorType).toBe(null);
      expect(state.recovery.isRecovering).toBe(false);
    });

    it('should accept track size estimate', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      governor.resetForNewTrack(45 * 1024 * 1024);

      const state = governor.getState();
      expect(state.isLargeTrack).toBe(true);
      expect(state.estimatedTrackSizeBytes).toBe(45 * 1024 * 1024);
    });
  });

  describe('error handling', () => {
    it('should classify NETWORK_NO_SOURCE as buffer failure when buffer is high', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Simulate high buffer state
      governor.setTrackSize(50 * 1024 * 1024);
      // Manually set high buffer (would normally come from audio element)
      governor._forceActivate(true);

      const result = governor.handleError(null, 3); // networkState === 3

      expect(result).toBe(true);
      
      const state = governor.getState();
      expect(state.recovery.errorType).not.toBe(null);
    });

    it('should NOT handle errors on non-iOS platforms', () => {
      mockDesktopNavigator();
      const governor = new IosBufferGovernor();

      const result = governor.handleError(null, 3);

      expect(result).toBe(false);
    });
  });

  describe('recovery', () => {
    it('should call recovery callback with resume position', async () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      const mockRecoveryCallback = vi.fn().mockResolvedValue(true);
      governor.setCallbacks({
        onRecoveryNeeded: mockRecoveryCallback,
      });

      // Set up state for recovery
      governor._simulateBufferFailure();
      // Manually set a good position
      const state = governor.getState();
      // Use private access pattern for testing
      (governor as any).state.recovery.lastGoodPosition = 60; // 60 seconds in

      const result = await governor.attemptRecovery();

      expect(mockRecoveryCallback).toHaveBeenCalled();
      const callArg = mockRecoveryCallback.mock.calls[0][0];
      expect(callArg).toBeLessThanOrEqual(60);
      expect(callArg).toBeGreaterThanOrEqual(60 - BUFFER_GOVERNOR_CONFIG.RECOVERY_JITTER_SECONDS);
    });

    it('should respect MAX_RECOVERY_ATTEMPTS', async () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      const mockRecoveryCallback = vi.fn().mockResolvedValue(false);
      const mockExhaustedCallback = vi.fn();
      governor.setCallbacks({
        onRecoveryNeeded: mockRecoveryCallback,
        onRecoveryExhausted: mockExhaustedCallback,
      });

      // Set up state for recovery
      (governor as any).state.recovery.lastGoodPosition = 60;

      // Attempt recovery multiple times
      for (let i = 0; i < BUFFER_GOVERNOR_CONFIG.MAX_RECOVERY_ATTEMPTS + 1; i++) {
        governor._simulateBufferFailure();
        await governor.attemptRecovery();
      }

      expect(mockExhaustedCallback).toHaveBeenCalled();
    });

    it('should NOT attempt recovery if position is too early', async () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      const mockRecoveryCallback = vi.fn().mockResolvedValue(true);
      governor.setCallbacks({
        onRecoveryNeeded: mockRecoveryCallback,
      });

      // Set up state with position below minimum
      governor._simulateBufferFailure();
      (governor as any).state.recovery.lastGoodPosition = 2; // Only 2 seconds in

      const result = await governor.attemptRecovery();

      expect(result).toBe(false);
      expect(mockRecoveryCallback).not.toHaveBeenCalled();
    });
  });

  describe('audio element configuration', () => {
    it('should configure audio element on iOS', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      const mockAudio = {
        preload: 'auto',
      } as unknown as HTMLAudioElement;

      governor.configureAudioElement(mockAudio);

      expect(mockAudio.preload).toBe('metadata');
    });

    it('should NOT modify audio element on non-iOS', () => {
      mockDesktopNavigator();
      const governor = new IosBufferGovernor();

      const mockAudio = {
        preload: 'auto',
      } as unknown as HTMLAudioElement;

      governor.configureAudioElement(mockAudio);

      expect(mockAudio.preload).toBe('auto');
    });
  });

  describe('test hooks', () => {
    it('should allow forcing activation state', () => {
      mockDesktopNavigator();
      const governor = new IosBufferGovernor();

      expect(governor.isActive()).toBe(false);

      governor._forceActivate(true);

      expect(governor.isActive()).toBe(true);
    });

    it('should allow simulating buffer failure', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      governor._simulateBufferFailure();

      const state = governor.getState();
      expect(state.recovery.errorType).toBe('IOS_WEBKIT_BUFFER_FAILURE');
    });
  });

  describe('singleton', () => {
    it('should return same instance from getIosBufferGovernor', () => {
      mockIOSNavigator();
      const governor1 = getIosBufferGovernor();
      const governor2 = getIosBufferGovernor();

      expect(governor1).toBe(governor2);
    });

    it('should create new instance after reset', () => {
      mockIOSNavigator();
      const governor1 = getIosBufferGovernor();
      resetIosBufferGovernor();
      const governor2 = getIosBufferGovernor();

      expect(governor1).not.toBe(governor2);
    });
  });
});

describe('BUFFER_GOVERNOR_CONFIG', () => {
  it('should have safe buffer limits', () => {
    // WebKit crashes at ~22-23MB, our limits should be well under
    expect(BUFFER_GOVERNOR_CONFIG.DEFAULT_BUFFER_LIMIT_BYTES).toBeLessThan(20 * 1024 * 1024);
    expect(BUFFER_GOVERNOR_CONFIG.CELLULAR_BUFFER_LIMIT_BYTES).toBeLessThan(15 * 1024 * 1024);
  });

  it('should have conservative prefetch limits', () => {
    expect(BUFFER_GOVERNOR_CONFIG.DEFAULT_PREFETCH_LIMIT_BYTES).toBeLessThan(
      BUFFER_GOVERNOR_CONFIG.DEFAULT_BUFFER_LIMIT_BYTES
    );
    expect(BUFFER_GOVERNOR_CONFIG.CELLULAR_PREFETCH_LIMIT_BYTES).toBeLessThan(
      BUFFER_GOVERNOR_CONFIG.CELLULAR_BUFFER_LIMIT_BYTES
    );
  });

  it('should have reasonable recovery settings', () => {
    expect(BUFFER_GOVERNOR_CONFIG.MAX_RECOVERY_ATTEMPTS).toBeGreaterThanOrEqual(2);
    expect(BUFFER_GOVERNOR_CONFIG.MAX_RECOVERY_ATTEMPTS).toBeLessThanOrEqual(5);
    expect(BUFFER_GOVERNOR_CONFIG.RECOVERY_JITTER_SECONDS).toBeGreaterThan(0);
    expect(BUFFER_GOVERNOR_CONFIG.RECOVERY_JITTER_SECONDS).toBeLessThanOrEqual(5);
  });
});
