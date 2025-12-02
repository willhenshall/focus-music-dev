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
      expect(governor.shouldAllowPrefetch()).toBe(true);
      
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
    
    it('should block prefetch for large tracks with high buffer', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set a large track
      governor.setTrackSize('largeTrack', 50 * 1024 * 1024, 600);
      
      // Set high buffer estimate (above prefetch limit)
      (governor as any).state.estimatedBufferedBytes = 10 * 1024 * 1024; // 10MB
      
      // Trigger prefetch state update
      (governor as any).updatePrefetchState();
      
      expect(governor.shouldAllowPrefetch()).toBe(false);
      
      const state = governor.getState();
      expect(state.prefetch.allowed).toBe(false);
      expect(state.prefetch.reason).toBe('largeTrackOnIOS');
    });
    
    it('should allow prefetch for small tracks', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set a small track (5MB)
      governor.setTrackSize('smallTrack', 5 * 1024 * 1024, 60);
      
      // Low buffer estimate
      (governor as any).state.estimatedBufferedBytes = 2 * 1024 * 1024; // 2MB
      
      // Trigger prefetch state update
      (governor as any).updatePrefetchState();
      
      expect(governor.shouldAllowPrefetch()).toBe(true);
    });
  });

  describe('track size management', () => {
    it('should identify large tracks', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set a large track size (50MB)
      governor.setTrackSize('track123', 50 * 1024 * 1024);

      const state = governor.getState();
      expect(state.isLargeTrack).toBe(true);
      expect(state.estimatedTrackSizeBytes).toBe(50 * 1024 * 1024);
    });

    it('should NOT identify small tracks as large', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set a small track size (5MB)
      governor.setTrackSize('track456', 5 * 1024 * 1024);

      const state = governor.getState();
      expect(state.isLargeTrack).toBe(false);
    });
    
    it('should calculate bytesPerSecond when duration is provided', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set a 48MB track that's 600 seconds (10 minutes)
      const sizeBytes = 48 * 1024 * 1024;
      const duration = 600;
      governor.setTrackSize('track789', sizeBytes, duration);

      // bytesPerSecond should be sizeBytes / duration
      const expectedBps = sizeBytes / duration;
      
      // Access internal state for verification
      expect((governor as any).bytesPerSecond).toBeCloseTo(expectedBps, 0);
    });
    
    it('should update bytesPerSecond when duration is set separately', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set track size first without duration
      const sizeBytes = 48 * 1024 * 1024;
      governor.setTrackSize('track999', sizeBytes);
      
      // bytesPerSecond should be 0 initially
      expect((governor as any).bytesPerSecond).toBe(0);
      
      // Now set duration
      const duration = 600;
      governor.setTrackDuration(duration);
      
      // bytesPerSecond should now be calculated
      const expectedBps = sizeBytes / duration;
      expect((governor as any).bytesPerSecond).toBeCloseTo(expectedBps, 0);
    });
  });

  describe('resetForNewTrack', () => {
    it('should reset recovery state', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Simulate some state
      governor._simulateBufferFailure();
      
      // Reset
      governor.resetForNewTrack('newTrack123');

      const state = governor.getState();
      expect(state.recovery.attempts).toBe(0);
      expect(state.recovery.errorType).toBe(null);
      expect(state.recovery.isRecovering).toBe(false);
    });

    it('should accept track size estimate', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      governor.resetForNewTrack('track456', 45 * 1024 * 1024);

      const state = governor.getState();
      expect(state.isLargeTrack).toBe(true);
      expect(state.estimatedTrackSizeBytes).toBe(45 * 1024 * 1024);
    });
    
    it('should reset internal track-specific data', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set up some track data
      governor.setTrackSize('oldTrack', 50 * 1024 * 1024, 600);
      
      // Reset for new track
      governor.resetForNewTrack('newTrack');
      
      // Internal data should be reset
      expect((governor as any).trackSizeBytes).toBe(0);
      expect((governor as any).trackDuration).toBe(0);
      expect((governor as any).bytesPerSecond).toBe(0);
      expect((governor as any).currentTrackId).toBe('newTrack');
    });
  });

  describe('error handling', () => {
    it('should classify NETWORK_NO_SOURCE as buffer failure when buffer is high', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Simulate high buffer state - set large track with high buffer
      governor.setTrackSize('track123', 50 * 1024 * 1024, 600);
      // Manually set high buffer estimate to trigger buffer failure classification
      (governor as any).state.estimatedBufferedBytes = 15 * 1024 * 1024; // 15MB
      governor._forceActivate(true);

      const result = governor.handleError(null, 3); // networkState === 3

      expect(result).toBe(true);
      
      const state = governor.getState();
      expect(state.recovery.errorType).toBe('IOS_WEBKIT_BUFFER_FAILURE');
    });

    it('should NOT handle errors on non-iOS platforms', () => {
      mockDesktopNavigator();
      const governor = new IosBufferGovernor();

      const result = governor.handleError(null, 3);

      expect(result).toBe(false);
    });
    
    it('should classify NotSupportedError', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      const notSupportedError = new Error('NotSupportedError: The operation is not supported');
      const result = governor.handleError(notSupportedError, 2);

      expect(result).toBe(true);
      
      const state = governor.getState();
      expect(state.recovery.errorType).toBe('NOT_SUPPORTED_ERROR');
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

  describe('buffer monitoring', () => {
    it('should update estimatedBufferedBytes using bytesPerSecond', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      // Set up track with known size and duration
      const sizeBytes = 48 * 1024 * 1024; // 48MB
      const duration = 600; // 10 minutes
      governor.setTrackSize('track123', sizeBytes, duration);
      
      // Simulate buffer at 60 seconds
      const bufferedSeconds = 60;
      governor.updateBufferedBytes(bufferedSeconds);
      
      // Expected: 60 * (48MB / 600) = 4.8MB
      const expectedBytes = Math.floor(bufferedSeconds * (sizeBytes / duration));
      
      const state = governor.getState();
      expect(state.estimatedBufferedBytes).toBe(expectedBytes);
    });
    
    it('should trigger throttling when buffer approaches limit', () => {
      mockIOSNavigator();
      const governor = new IosBufferGovernor();

      const mockThrottleStart = vi.fn();
      governor.setCallbacks({ onThrottleStart: mockThrottleStart });

      // Set up large track
      const sizeBytes = 100 * 1024 * 1024; // 100MB
      const duration = 600;
      governor.setTrackSize('bigTrack', sizeBytes, duration);
      
      // Simulate buffer approaching 90% of limit
      // With cellular limit of 12MB, we need to buffer ~10.8MB
      // 10.8MB = bufferedSeconds * (100MB / 600)
      // bufferedSeconds = 10.8 * 600 / 100 = 64.8 seconds
      const bufferedSeconds = 70; // Should exceed 90%
      governor.updateBufferedBytes(bufferedSeconds);
      
      const state = governor.getState();
      expect(state.isThrottling).toBe(true);
      expect(mockThrottleStart).toHaveBeenCalled();
    });
    
    it('should NOT update buffer on non-iOS platforms', () => {
      mockDesktopNavigator();
      const governor = new IosBufferGovernor();

      governor.setTrackSize('track', 50 * 1024 * 1024, 600);
      governor.updateBufferedBytes(60);
      
      const state = governor.getState();
      // Should remain 0 since governor is not active
      expect(state.estimatedBufferedBytes).toBe(0);
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
