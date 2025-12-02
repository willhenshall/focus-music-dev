/**
 * Unit tests for Track Size Probe
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  probeTrackSize,
  probeTrackSizeWithRange,
  shouldProbeTrackSize,
  clearTrackSizeCache,
  getCachedTrackSize,
  extractTrackIdFromUrl,
} from '../trackSizeProbe';

// Mock navigator for iOS detection
const mockNavigator = (ua: string) => {
  Object.defineProperty(global, 'navigator', {
    value: {
      userAgent: ua,
      platform: '',
      maxTouchPoints: 0,
    },
    writable: true,
    configurable: true,
  });
};

const mockIOSNavigator = () => {
  mockNavigator(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  );
};

const mockDesktopNavigator = () => {
  mockNavigator(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
  );
};

describe('trackSizeProbe', () => {
  const originalNavigator = global.navigator;
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearTrackSizeCache();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    global.fetch = originalFetch;
  });

  describe('shouldProbeTrackSize', () => {
    it('should return true on iOS', () => {
      mockIOSNavigator();
      expect(shouldProbeTrackSize()).toBe(true);
    });

    it('should return false on desktop', () => {
      mockDesktopNavigator();
      expect(shouldProbeTrackSize()).toBe(false);
    });
  });

  describe('extractTrackIdFromUrl', () => {
    it('should extract track ID from CDN URL', () => {
      const url = 'https://media.focus.music/audio/147284.mp3';
      expect(extractTrackIdFromUrl(url)).toBe('147284');
    });

    it('should extract track ID from Supabase URL', () => {
      const url = 'https://xxx.supabase.co/storage/v1/object/public/audio-files/147284.mp3';
      expect(extractTrackIdFromUrl(url)).toBe('147284');
    });

    it('should extract track ID from simple path', () => {
      const url = '/audio/147284.mp3';
      expect(extractTrackIdFromUrl(url)).toBe('147284');
    });

    it('should return null for invalid URL', () => {
      expect(extractTrackIdFromUrl('not-a-valid-url')).toBe(null);
    });
  });

  describe('probeTrackSize', () => {
    it('should parse Content-Length header', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Map([
          ['content-length', '48038400'],
          ['content-type', 'audio/mpeg'],
        ]),
      };
      mockResponse.headers.get = (key: string) => mockResponse.headers.get(key.toLowerCase());

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            if (key === 'content-length') return '48038400';
            if (key === 'content-type') return 'audio/mpeg';
            return null;
          },
        },
      });

      const result = await probeTrackSize('https://example.com/audio/147284.mp3', '147284');

      expect(result.probeSuccess).toBe(true);
      expect(result.sizeBytes).toBe(48038400);
      expect(result.sizeMB).toBeCloseTo(45.8, 1);
    });

    it('should return cached result', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            if (key === 'content-length') return '48038400';
            return null;
          },
        },
      });

      // First call
      const result1 = await probeTrackSize('https://example.com/audio/147284.mp3', '147284');
      expect(result1.probeSuccess).toBe(true);

      // Second call should use cache
      const result2 = await probeTrackSize('https://example.com/audio/147284.mp3', '147284');
      expect(result2.probeSuccess).toBe(true);

      // Fetch should only be called once due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle failed requests', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: {
          get: () => null,
        },
      });

      const result = await probeTrackSize('https://example.com/audio/missing.mp3', 'missing');

      expect(result.probeSuccess).toBe(false);
      expect(result.sizeBytes).toBe(0);
      expect(result.error).toContain('404');
    });
  });

  describe('probeTrackSizeWithRange', () => {
    it('should parse Content-Range header from 206 response', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 206,
        headers: {
          get: (key: string) => {
            if (key === 'content-range') return 'bytes 0-1/48038400';
            if (key === 'content-type') return 'audio/mpeg';
            return null;
          },
        },
      });

      const result = await probeTrackSizeWithRange('https://example.com/audio/147284.mp3', '147284');

      expect(result.probeSuccess).toBe(true);
      expect(result.sizeBytes).toBe(48038400);
    });
  });

  describe('getCachedTrackSize', () => {
    it('should return undefined for uncached track', () => {
      expect(getCachedTrackSize('nonexistent')).toBeUndefined();
    });

    it('should return cached info after probe', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            if (key === 'content-length') return '48038400';
            return null;
          },
        },
      });

      await probeTrackSize('https://example.com/audio/147284.mp3', '147284');

      const cached = getCachedTrackSize('147284');
      expect(cached).toBeDefined();
      expect(cached?.sizeBytes).toBe(48038400);
    });
  });

  describe('clearTrackSizeCache', () => {
    it('should clear all cached entries', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            if (key === 'content-length') return '48038400';
            return null;
          },
        },
      });

      await probeTrackSize('https://example.com/audio/147284.mp3', '147284');
      expect(getCachedTrackSize('147284')).toBeDefined();

      clearTrackSizeCache();
      expect(getCachedTrackSize('147284')).toBeUndefined();
    });
  });
});
