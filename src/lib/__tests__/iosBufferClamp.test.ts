/**
 * Unit tests for iOS Buffer Clamp
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IOS_BUFFER_CLAMP_CONFIG,
  isIOSWebKit,
  getBufferLimitMB,
  estimateBufferSizeMB,
  shouldClampBuffer,
  getClampState,
  resetClampState,
  getIOSClampConfig,
} from '../iosBufferClamp';
import type { IosWebkitInfo } from '../iosWebkitDetection';

// Mock iOS WebKit info
const createIOSInfo = (options: Partial<IosWebkitInfo> = {}): IosWebkitInfo => ({
  isIOSWebKit: true,
  isLikelyRealDevice: true,
  browserName: 'Safari',
  isCellular: false,
  connectionType: 'wifi',
  effectiveType: '4g',
  isIPad: false,
  iosVersion: '17.0',
  ...options,
});

const createDesktopInfo = (): IosWebkitInfo => ({
  isIOSWebKit: false,
  isLikelyRealDevice: false,
  browserName: 'Chrome',
  isCellular: false,
  connectionType: null,
  effectiveType: null,
  isIPad: false,
  iosVersion: null,
});

// Mock audio element with buffered ranges
const createMockAudio = (bufferedSeconds: number, duration: number = 600): HTMLAudioElement => {
  const mockBuffered = {
    length: bufferedSeconds > 0 ? 1 : 0,
    start: (index: number) => 0,
    end: (index: number) => bufferedSeconds,
  };

  return {
    buffered: mockBuffered,
    duration,
    currentTime: 0,
  } as unknown as HTMLAudioElement;
};

describe('iosBufferClamp', () => {
  describe('IOS_BUFFER_CLAMP_CONFIG', () => {
    it('should have safe buffer limits well below 22MB crash point', () => {
      expect(IOS_BUFFER_CLAMP_CONFIG.WIFI_LIMIT_MB).toBeLessThan(20);
      expect(IOS_BUFFER_CLAMP_CONFIG.CELLULAR_LIMIT_MB).toBeLessThan(15);
    });

    it('should have cellular limit lower than WiFi limit', () => {
      expect(IOS_BUFFER_CLAMP_CONFIG.CELLULAR_LIMIT_MB).toBeLessThan(
        IOS_BUFFER_CLAMP_CONFIG.WIFI_LIMIT_MB
      );
    });

    it('should have clamp threshold between 0.5 and 1.0', () => {
      expect(IOS_BUFFER_CLAMP_CONFIG.CLAMP_THRESHOLD).toBeGreaterThan(0.5);
      expect(IOS_BUFFER_CLAMP_CONFIG.CLAMP_THRESHOLD).toBeLessThanOrEqual(1.0);
    });
  });

  describe('isIOSWebKit', () => {
    it('should return true for iOS Safari', () => {
      const info = createIOSInfo({ browserName: 'Safari' });
      expect(isIOSWebKit(info)).toBe(true);
    });

    it('should return true for iOS Chrome', () => {
      const info = createIOSInfo({ browserName: 'Chrome' });
      expect(isIOSWebKit(info)).toBe(true);
    });

    it('should return false for desktop Chrome', () => {
      const info = createDesktopInfo();
      expect(isIOSWebKit(info)).toBe(false);
    });
  });

  describe('getBufferLimitMB', () => {
    it('should return WiFi limit for iOS on WiFi', () => {
      const info = createIOSInfo({ isCellular: false });
      expect(getBufferLimitMB(info)).toBe(IOS_BUFFER_CLAMP_CONFIG.WIFI_LIMIT_MB);
    });

    it('should return cellular limit for iOS on cellular', () => {
      const info = createIOSInfo({ isCellular: true });
      expect(getBufferLimitMB(info)).toBe(IOS_BUFFER_CLAMP_CONFIG.CELLULAR_LIMIT_MB);
    });

    it('should return Infinity for non-iOS', () => {
      const info = createDesktopInfo();
      expect(getBufferLimitMB(info)).toBe(Infinity);
    });
  });

  describe('estimateBufferSizeMB', () => {
    it('should return 0 for empty buffer', () => {
      const audio = createMockAudio(0);
      expect(estimateBufferSizeMB(audio)).toBe(0);
    });

    it('should estimate buffer size based on buffered seconds and bitrate', () => {
      // 60 seconds buffered at 256kbps = 60 * 256000 / 8 / 1024 / 1024 = ~1.83 MB
      const audio = createMockAudio(60);
      const sizeMB = estimateBufferSizeMB(audio);
      expect(sizeMB).toBeGreaterThan(1.5);
      expect(sizeMB).toBeLessThan(2.5);
    });

    it('should scale linearly with buffered time', () => {
      const audio30s = createMockAudio(30);
      const audio60s = createMockAudio(60);
      
      const size30 = estimateBufferSizeMB(audio30s);
      const size60 = estimateBufferSizeMB(audio60s);
      
      // 60s should be ~2x 30s
      expect(size60).toBeCloseTo(size30 * 2, 1);
    });
  });

  describe('shouldClampBuffer', () => {
    it('should NOT clamp for non-iOS browsers', () => {
      const audio = createMockAudio(300); // 5 minutes buffered = lots of data
      const info = createDesktopInfo();
      
      const result = shouldClampBuffer(audio, info);
      
      expect(result.shouldClamp).toBe(false);
      expect(result.reason).toBe('not_ios');
    });

    it('should NOT clamp when buffer is well under limit', () => {
      const audio = createMockAudio(30); // ~1MB buffered
      const info = createIOSInfo({ isCellular: false });
      
      const result = shouldClampBuffer(audio, info);
      
      expect(result.shouldClamp).toBe(false);
      expect(result.reason).toBe('under_limit');
    });

    it('should clamp when buffer approaches limit', () => {
      // WiFi limit is 12MB, threshold is 85% = ~10.2MB
      // At 256kbps, 10MB = ~327 seconds of audio
      const audio = createMockAudio(350); // Should exceed threshold
      const info = createIOSInfo({ isCellular: false });
      
      const result = shouldClampBuffer(audio, info);
      
      expect(result.shouldClamp).toBe(true);
      expect(['approaching_limit', 'over_limit']).toContain(result.reason);
    });

    it('should clamp with lower threshold on cellular', () => {
      // Cellular limit is 10MB, threshold is 85% = ~8.5MB
      // At 256kbps, 8.5MB = ~278 seconds of audio
      const audio = createMockAudio(300); // Should exceed threshold
      const info = createIOSInfo({ isCellular: true });
      
      const result = shouldClampBuffer(audio, info);
      
      expect(result.shouldClamp).toBe(true);
    });

    it('should return correct buffer and limit values', () => {
      const audio = createMockAudio(60);
      const info = createIOSInfo({ isCellular: false });
      
      const result = shouldClampBuffer(audio, info);
      
      expect(result.currentBufferMB).toBeGreaterThan(0);
      expect(result.limitMB).toBe(IOS_BUFFER_CLAMP_CONFIG.WIFI_LIMIT_MB);
    });
  });

  describe('getClampState', () => {
    it('should return correct state for iOS', () => {
      const audio = createMockAudio(60);
      const info = createIOSInfo({ browserName: 'Safari', isCellular: true });
      
      const state = getClampState(audio, info, false);
      
      expect(state.isIOSWebKit).toBe(true);
      expect(state.browserName).toBe('Safari');
      expect(state.isCellular).toBe(true);
      expect(state.bufferLimitMB).toBe(IOS_BUFFER_CLAMP_CONFIG.CELLULAR_LIMIT_MB);
      expect(state.currentBufferMB).toBeGreaterThan(0);
      expect(state.prefetchDisabled).toBe(false);
    });

    it('should return correct state for non-iOS', () => {
      const audio = createMockAudio(60);
      const info = createDesktopInfo();
      
      const state = getClampState(audio, info, false);
      
      expect(state.isIOSWebKit).toBe(false);
      expect(state.bufferLimitMB).toBe(Infinity);
    });

    it('should reflect prefetchDisabled flag', () => {
      const audio = createMockAudio(60);
      const info = createIOSInfo();
      
      const stateDisabled = getClampState(audio, info, true);
      const stateEnabled = getClampState(audio, info, false);
      
      expect(stateDisabled.prefetchDisabled).toBe(true);
      expect(stateDisabled.isClampActive).toBe(true);
      expect(stateEnabled.prefetchDisabled).toBe(false);
      expect(stateEnabled.isClampActive).toBe(false);
    });

    it('should handle null audio element', () => {
      const info = createIOSInfo();
      
      const state = getClampState(null, info, false);
      
      expect(state.currentBufferMB).toBe(0);
      expect(state.isIOSWebKit).toBe(true);
    });
  });

  describe('resetClampState', () => {
    it('should return a fresh state with prefetch enabled', () => {
      const state = resetClampState();
      expect(state.prefetchDisabled).toBe(false);
    });
  });

  describe('getIOSClampConfig', () => {
    it('should return a copy of the config', () => {
      const config = getIOSClampConfig();
      
      expect(config.WIFI_LIMIT_MB).toBe(IOS_BUFFER_CLAMP_CONFIG.WIFI_LIMIT_MB);
      expect(config.CELLULAR_LIMIT_MB).toBe(IOS_BUFFER_CLAMP_CONFIG.CELLULAR_LIMIT_MB);
      expect(config.CLAMP_THRESHOLD).toBe(IOS_BUFFER_CLAMP_CONFIG.CLAMP_THRESHOLD);
    });
  });
});

describe('iOS Clamp Integration Scenarios', () => {
  describe('NatureBeat long track scenario', () => {
    // NatureBeat tracks are ~50MB, ~10 minutes
    // At 256kbps, 10 minutes = 600 seconds
    
    it('should clamp early on cellular for long tracks', () => {
      const info = createIOSInfo({ isCellular: true });
      
      // Simulate progressive buffering
      const bufferProgression = [60, 120, 180, 240, 300, 360];
      
      let clampedAt: number | null = null;
      
      for (const seconds of bufferProgression) {
        const audio = createMockAudio(seconds, 600);
        const result = shouldClampBuffer(audio, info);
        
        if (result.shouldClamp && clampedAt === null) {
          clampedAt = seconds;
          break;
        }
      }
      
      // Should clamp well before track ends
      expect(clampedAt).not.toBeNull();
      expect(clampedAt).toBeLessThan(400); // Should clamp before ~6.5 minutes
    });

    it('should allow more buffering on WiFi', () => {
      const cellularInfo = createIOSInfo({ isCellular: true });
      const wifiInfo = createIOSInfo({ isCellular: false });
      
      // Find when each clamps
      const findClampPoint = (info: IosWebkitInfo): number => {
        for (let seconds = 60; seconds <= 600; seconds += 30) {
          const audio = createMockAudio(seconds, 600);
          if (shouldClampBuffer(audio, info).shouldClamp) {
            return seconds;
          }
        }
        return 600;
      };
      
      const cellularClamp = findClampPoint(cellularInfo);
      const wifiClamp = findClampPoint(wifiInfo);
      
      // WiFi should allow more buffering than cellular
      expect(wifiClamp).toBeGreaterThan(cellularClamp);
    });
  });

  describe('Short track scenario', () => {
    it('should never clamp for short tracks (< 5 minutes)', () => {
      const info = createIOSInfo({ isCellular: true });
      
      // 3 minute track fully buffered
      const audio = createMockAudio(180, 180);
      const result = shouldClampBuffer(audio, info);
      
      // 3 minutes at 256kbps = ~5.5MB, which is under cellular limit
      expect(result.currentBufferMB).toBeLessThan(IOS_BUFFER_CLAMP_CONFIG.CELLULAR_LIMIT_MB);
      expect(result.shouldClamp).toBe(false);
    });
  });
});
