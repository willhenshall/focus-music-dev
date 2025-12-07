/**
 * Unit tests for Native HLS Monitor
 * 
 * Tests the monitoring logic for iOS Safari native HLS playback,
 * including tier extraction, bandwidth formatting, and tier comparison.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  extractTierFromUrl,
  formatBandwidth,
  isHLSResource,
  compareTiers,
  NativeHLSMonitor,
  getNativeHLSMonitor,
  resetNativeHLSMonitor,
} from '../nativeHLSMonitor';
import type { QualityTier } from '../types/nativeHLSMetrics';
import { TIER_BANDWIDTHS } from '../types/nativeHLSMetrics';

// =============================================================================
// URL Tier Extraction Tests
// =============================================================================

describe('extractTierFromUrl', () => {
  it('extracts LOW tier from URL path', () => {
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/low/segment_001.ts')).toBe('low');
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/LOW/segment_001.ts')).toBe('low');
  });

  it('extracts MEDIUM tier from URL path', () => {
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/medium/segment_001.ts')).toBe('medium');
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/MEDIUM/segment_001.ts')).toBe('medium');
  });

  it('extracts HIGH tier from URL path', () => {
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/high/segment_001.ts')).toBe('high');
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/HIGH/segment_001.ts')).toBe('high');
  });

  it('extracts PREMIUM tier from URL path', () => {
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/premium/segment_001.ts')).toBe('premium');
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/PREMIUM/segment_001.ts')).toBe('premium');
  });

  it('returns unknown for non-tier URLs', () => {
    expect(extractTierFromUrl('https://cdn.example.com/hls/track123/segment_001.ts')).toBe('unknown');
    expect(extractTierFromUrl('https://cdn.example.com/audio/track123.mp3')).toBe('unknown');
    expect(extractTierFromUrl('')).toBe('unknown');
  });

  it('handles URLs with tier in different positions', () => {
    expect(extractTierFromUrl('/hls/abc/low/index.m3u8')).toBe('low');
    expect(extractTierFromUrl('file:///low/test.ts')).toBe('low');
  });
});

// =============================================================================
// Bandwidth Formatting Tests
// =============================================================================

describe('formatBandwidth', () => {
  it('formats bandwidth in Mbps for values >= 1M', () => {
    expect(formatBandwidth(1_000_000)).toBe('1.0 Mbps');
    expect(formatBandwidth(2_500_000)).toBe('2.5 Mbps');
    expect(formatBandwidth(10_000_000)).toBe('10.0 Mbps');
  });

  it('formats bandwidth in kbps for values >= 1K and < 1M', () => {
    expect(formatBandwidth(1_000)).toBe('1 kbps');
    expect(formatBandwidth(128_000)).toBe('128 kbps');
    expect(formatBandwidth(999_999)).toBe('1000 kbps');
  });

  it('formats bandwidth in bps for values < 1K', () => {
    expect(formatBandwidth(500)).toBe('500 bps');
    expect(formatBandwidth(0)).toBe('0 bps');
  });

  it('handles our actual tier bandwidths', () => {
    expect(formatBandwidth(TIER_BANDWIDTHS.low)).toBe('48 kbps');
    expect(formatBandwidth(TIER_BANDWIDTHS.medium)).toBe('96 kbps');
    expect(formatBandwidth(TIER_BANDWIDTHS.high)).toBe('144 kbps');
    expect(formatBandwidth(TIER_BANDWIDTHS.premium)).toBe('192 kbps');
  });
});

// =============================================================================
// HLS Resource Detection Tests
// =============================================================================

describe('isHLSResource', () => {
  it('identifies .ts segment files', () => {
    expect(isHLSResource('https://cdn.example.com/hls/track/low/segment_001.ts')).toBe(true);
    expect(isHLSResource('/hls/track/segment.ts')).toBe(true);
  });

  it('identifies .m3u8 playlist files', () => {
    expect(isHLSResource('https://cdn.example.com/hls/track/master.m3u8')).toBe(true);
    expect(isHLSResource('/hls/track/index.m3u8')).toBe(true);
  });

  it('returns false for non-HLS files', () => {
    expect(isHLSResource('https://cdn.example.com/audio/track.mp3')).toBe(false);
    expect(isHLSResource('/images/cover.jpg')).toBe(false);
    expect(isHLSResource('https://api.example.com/tracks')).toBe(false);
  });
});

// =============================================================================
// Tier Comparison Tests
// =============================================================================

describe('compareTiers', () => {
  it('identifies upgrades correctly', () => {
    expect(compareTiers('low', 'medium')).toBe('upgrade');
    expect(compareTiers('low', 'high')).toBe('upgrade');
    expect(compareTiers('low', 'premium')).toBe('upgrade');
    expect(compareTiers('medium', 'high')).toBe('upgrade');
    expect(compareTiers('medium', 'premium')).toBe('upgrade');
    expect(compareTiers('high', 'premium')).toBe('upgrade');
  });

  it('identifies downgrades correctly', () => {
    expect(compareTiers('premium', 'high')).toBe('downgrade');
    expect(compareTiers('premium', 'medium')).toBe('downgrade');
    expect(compareTiers('premium', 'low')).toBe('downgrade');
    expect(compareTiers('high', 'medium')).toBe('downgrade');
    expect(compareTiers('high', 'low')).toBe('downgrade');
    expect(compareTiers('medium', 'low')).toBe('downgrade');
  });

  it('identifies same tier correctly', () => {
    expect(compareTiers('low', 'low')).toBe('same');
    expect(compareTiers('medium', 'medium')).toBe('same');
    expect(compareTiers('high', 'high')).toBe('same');
    expect(compareTiers('premium', 'premium')).toBe('same');
  });

  it('returns same for unknown tiers', () => {
    expect(compareTiers('unknown', 'low')).toBe('same');
    expect(compareTiers('low', 'unknown')).toBe('same');
    expect(compareTiers('unknown', 'unknown')).toBe('same');
  });
});

// =============================================================================
// TIER_BANDWIDTHS Constants Tests
// =============================================================================

describe('TIER_BANDWIDTHS', () => {
  it('has correct bandwidth values for each tier', () => {
    expect(TIER_BANDWIDTHS.low).toBe(48000);
    expect(TIER_BANDWIDTHS.medium).toBe(96000);
    expect(TIER_BANDWIDTHS.high).toBe(144000);
    expect(TIER_BANDWIDTHS.premium).toBe(192000);
  });

  it('bandwidths are in ascending order', () => {
    expect(TIER_BANDWIDTHS.low).toBeLessThan(TIER_BANDWIDTHS.medium);
    expect(TIER_BANDWIDTHS.medium).toBeLessThan(TIER_BANDWIDTHS.high);
    expect(TIER_BANDWIDTHS.high).toBeLessThan(TIER_BANDWIDTHS.premium);
  });
});

// =============================================================================
// NativeHLSMonitor Class Tests
// =============================================================================

describe('NativeHLSMonitor', () => {
  let monitor: NativeHLSMonitor;
  let mockAudio: HTMLAudioElement;

  beforeEach(() => {
    // Reset singleton
    resetNativeHLSMonitor();
    
    // Create a new monitor
    monitor = new NativeHLSMonitor({ debug: false });
    
    // Create mock audio element
    mockAudio = document.createElement('audio');
    
    // Mock buffered TimeRanges
    Object.defineProperty(mockAudio, 'buffered', {
      get: () => ({
        length: 1,
        start: () => 0,
        end: () => 30,
      }),
    });
  });

  afterEach(() => {
    monitor.stop();
  });

  it('initializes with default state', () => {
    const metrics = monitor.getMetrics();
    
    expect(metrics.currentTier).toBe('unknown');
    expect(metrics.segmentHistory).toEqual([]);
    expect(metrics.tierSwitchHistory).toEqual([]);
    expect(metrics.stallCount).toBe(0);
    expect(metrics.isMonitoring).toBe(false);
  });

  it('starts monitoring when start() is called', () => {
    monitor.start(mockAudio);
    
    const metrics = monitor.getMetrics();
    expect(metrics.isMonitoring).toBe(true);
    expect(metrics.monitoringStartTime).toBeGreaterThan(0);
  });

  it('stops monitoring when stop() is called', () => {
    monitor.start(mockAudio);
    monitor.stop();
    
    const metrics = monitor.getMetrics();
    expect(metrics.isMonitoring).toBe(false);
  });

  it('resets state when restarted', () => {
    monitor.start(mockAudio);
    
    // Get initial start time
    const firstMetrics = monitor.getMetrics();
    const firstStartTime = firstMetrics.monitoringStartTime;
    
    // Wait a bit and restart
    monitor.stop();
    monitor.start(mockAudio);
    
    const secondMetrics = monitor.getMetrics();
    expect(secondMetrics.monitoringStartTime).toBeGreaterThanOrEqual(firstStartTime);
    expect(secondMetrics.isMonitoring).toBe(true);
  });

  it('getMetrics returns complete metrics structure', () => {
    monitor.start(mockAudio);
    const metrics = monitor.getMetrics();
    
    // Check all expected properties exist
    expect(metrics).toHaveProperty('currentTier');
    expect(metrics).toHaveProperty('lastSegmentUrl');
    expect(metrics).toHaveProperty('lastSegmentDownloadTime');
    expect(metrics).toHaveProperty('estimatedBandwidth');
    expect(metrics).toHaveProperty('bandwidthDisplay');
    expect(metrics).toHaveProperty('bufferLength');
    expect(metrics).toHaveProperty('stallCount');
    expect(metrics).toHaveProperty('lastStall');
    expect(metrics).toHaveProperty('isStalled');
    expect(metrics).toHaveProperty('audioDecodedBytes');
    expect(metrics).toHaveProperty('decodedBytesPerSecond');
    expect(metrics).toHaveProperty('inferredPlaybackBitrate');
    expect(metrics).toHaveProperty('connection');
    expect(metrics).toHaveProperty('segmentHistory');
    expect(metrics).toHaveProperty('tierSwitchHistory');
    expect(metrics).toHaveProperty('monitoringStartTime');
    expect(metrics).toHaveProperty('monitoringDuration');
    expect(metrics).toHaveProperty('isMonitoring');
  });

  it('calculates buffer length from audio.buffered', () => {
    // Set currentTime to 10 seconds
    Object.defineProperty(mockAudio, 'currentTime', {
      get: () => 10,
      configurable: true,
    });
    
    monitor.start(mockAudio);
    const metrics = monitor.getMetrics();
    
    // Buffer ends at 30, current time is 10, so buffer length should be 20
    expect(metrics.bufferLength).toBe(20);
  });
});

// =============================================================================
// Singleton Pattern Tests
// =============================================================================

describe('getNativeHLSMonitor singleton', () => {
  beforeEach(() => {
    resetNativeHLSMonitor();
  });

  it('returns the same instance on multiple calls', () => {
    const monitor1 = getNativeHLSMonitor();
    const monitor2 = getNativeHLSMonitor();
    
    expect(monitor1).toBe(monitor2);
  });

  it('creates new instance after reset', () => {
    const monitor1 = getNativeHLSMonitor();
    resetNativeHLSMonitor();
    const monitor2 = getNativeHLSMonitor();
    
    expect(monitor1).not.toBe(monitor2);
  });
});

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe('Edge Cases', () => {
  it('handles empty URLs gracefully', () => {
    expect(extractTierFromUrl('')).toBe('unknown');
    expect(isHLSResource('')).toBe(false);
  });

  it('handles malformed URLs', () => {
    expect(extractTierFromUrl('not-a-url')).toBe('unknown');
    expect(isHLSResource('not-a-url')).toBe(false);
  });

  it('handles zero bandwidth', () => {
    expect(formatBandwidth(0)).toBe('0 bps');
  });

  it('handles very large bandwidth values', () => {
    expect(formatBandwidth(1_000_000_000)).toBe('1000.0 Mbps');
  });
});

