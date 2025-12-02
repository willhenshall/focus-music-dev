/**
 * Unit tests for iOS WebKit Detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  getIosWebkitInfo, 
  shouldActivateBufferGovernor,
  getBufferLimitsForNetwork,
  __testing,
} from '../iosWebkitDetection';

// Mock navigator
const mockNavigator = (ua: string, platform?: string, maxTouchPoints?: number) => {
  Object.defineProperty(global, 'navigator', {
    value: {
      userAgent: ua,
      platform: platform || '',
      maxTouchPoints: maxTouchPoints || 0,
      connection: undefined,
    },
    writable: true,
    configurable: true,
  });
};

describe('iOS WebKit Detection', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  describe('getIosWebkitInfo', () => {
    it('should detect iPhone Safari', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(true);
      expect(info.browserName).toBe('Safari');
      expect(info.isIPad).toBe(false);
      expect(info.iosVersion).toBe('17.0');
    });

    it('should detect iPhone Chrome (uses WebKit on iOS)', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.0.0 Mobile/15E148 Safari/604.1'
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(true);
      expect(info.browserName).toBe('Chrome');
    });

    it('should detect iPhone Firefox (uses WebKit on iOS)', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/118.0 Mobile/15E148 Safari/604.1'
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(true);
      expect(info.browserName).toBe('Firefox');
    });

    it('should detect iPhone Edge (uses WebKit on iOS)', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/118.0.0.0 Mobile/15E148 Safari/604.1'
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(true);
      expect(info.browserName).toBe('Edge');
    });

    it('should detect iPad Safari', () => {
      mockNavigator(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(true);
      expect(info.browserName).toBe('Safari');
      expect(info.isIPad).toBe(true);
    });

    it('should detect iPad in desktop mode (iOS 13+)', () => {
      mockNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'MacIntel',
        5 // Touch points indicate iPad
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(true);
      expect(info.isIPad).toBe(true);
    });

    it('should NOT detect desktop Safari as iOS', () => {
      mockNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'MacIntel',
        0 // No touch points = desktop
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(false);
    });

    it('should NOT detect desktop Chrome as iOS', () => {
      mockNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(false);
    });

    it('should NOT detect Android Chrome as iOS', () => {
      mockNavigator(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36'
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(false);
    });

    it('should detect iPod Touch', () => {
      mockNavigator(
        'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      );

      const info = getIosWebkitInfo();

      expect(info.isIOSWebKit).toBe(true);
    });

    it('should extract iOS version correctly', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_2 like Mac OS X) AppleWebKit/605.1.15'
      );

      const info = getIosWebkitInfo();

      expect(info.iosVersion).toBe('18.1.2');
    });
  });

  describe('shouldActivateBufferGovernor', () => {
    it('should activate for iOS WebKit', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      );

      expect(shouldActivateBufferGovernor()).toBe(true);
    });

    it('should NOT activate for desktop browsers', () => {
      mockNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
      );

      expect(shouldActivateBufferGovernor()).toBe(false);
    });

    it('should NOT activate for Android', () => {
      mockNavigator(
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36'
      );

      expect(shouldActivateBufferGovernor()).toBe(false);
    });
  });

  describe('getBufferLimitsForNetwork', () => {
    it('should return conservative limits for iOS WebKit', () => {
      mockNavigator(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      );

      const limits = getBufferLimitsForNetwork();

      expect(limits.isConservative).toBe(true);
      expect(limits.bufferLimitBytes).toBeLessThanOrEqual(20 * 1024 * 1024);
    });

    it('should return non-conservative limits for desktop', () => {
      mockNavigator(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      );

      const limits = getBufferLimitsForNetwork();

      expect(limits.isConservative).toBe(false);
    });
  });

  describe('detectBrowserName', () => {
    const { detectBrowserName } = __testing;

    it('should detect Chrome', () => {
      expect(detectBrowserName('Mozilla/5.0 Chrome/118.0')).toBe('Chrome');
    });

    it('should detect Firefox', () => {
      expect(detectBrowserName('Mozilla/5.0 Firefox/118.0')).toBe('Firefox');
    });

    it('should detect Safari', () => {
      expect(detectBrowserName('Mozilla/5.0 Safari/605.1')).toBe('Safari');
    });

    it('should detect Edge', () => {
      expect(detectBrowserName('Mozilla/5.0 Edg/118.0')).toBe('Edge');
    });
  });

  describe('detectIOSBrowserName', () => {
    const { detectIOSBrowserName } = __testing;

    it('should detect Chrome on iOS (CriOS)', () => {
      expect(detectIOSBrowserName('CriOS/118.0 Safari/604.1')).toBe('Chrome');
    });

    it('should detect Firefox on iOS (FxiOS)', () => {
      expect(detectIOSBrowserName('FxiOS/118.0 Safari/604.1')).toBe('Firefox');
    });

    it('should detect Edge on iOS (EdgiOS)', () => {
      expect(detectIOSBrowserName('EdgiOS/118.0 Safari/604.1')).toBe('Edge');
    });

    it('should detect Safari on iOS', () => {
      expect(detectIOSBrowserName('Safari/604.1 Version/17.0')).toBe('Safari');
    });

    it('should detect Brave on iOS', () => {
      expect(detectIOSBrowserName('Brave Safari/604.1')).toBe('Brave');
    });
  });

  describe('extractIOSVersion', () => {
    const { extractIOSVersion } = __testing;

    it('should extract version with underscores', () => {
      expect(extractIOSVersion('CPU iPhone OS 17_0_1 like Mac OS X')).toBe('17.0.1');
    });

    it('should extract version with dots', () => {
      expect(extractIOSVersion('OS 17.0.1')).toBe('17.0.1');
    });

    it('should return null for non-iOS UA', () => {
      expect(extractIOSVersion('Mozilla/5.0 Linux Android')).toBe(null);
    });
  });
});
