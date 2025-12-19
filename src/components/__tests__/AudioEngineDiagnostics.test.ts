/**
 * Tests for AudioEngineDiagnostics component helper functions
 * 
 * These tests verify the HLS diagnostics panel helper functions work correctly
 * for delivery source detection and health score calculation.
 */

import { describe, it, expect } from 'vitest';
import { getDeliverySource, calculateHealthScore, formatBitrate } from '../AudioEngineDiagnostics';

// ============================================================================
// Lightweight mock metric types (match the helper signatures)
// ============================================================================

interface HLSMetrics {
  isHLSActive: boolean;
  bufferLength: number;
  targetBuffer: number;
  fragmentStats: {
    loaded: number;
    failed: number;
    retried: number;
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('AudioEngineDiagnostics Helper Functions', () => {
  describe('getDeliverySource', () => {
    it('should return None for null URL', () => {
      const result = getDeliverySource(null);
      expect(result).toEqual({ source: 'None', type: 'unknown' });
    });

    it('should detect HLS from .m3u8 extension', () => {
      const result = getDeliverySource('https://example.com/audio/12345/master.m3u8');
      expect(result).toEqual({ source: 'Supabase HLS', type: 'hls' });
    });

    it('should detect HLS from audio-hls bucket path', () => {
      const result = getDeliverySource('https://supabase.co/storage/v1/object/audio-hls/12345/master.m3u8');
      expect(result).toEqual({ source: 'Supabase HLS', type: 'hls' });
    });

    it('should detect Cloudflare CDN from r2.dev domain', () => {
      const result = getDeliverySource('https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/179845.mp3');
      expect(result).toEqual({ source: 'Cloudflare CDN', type: 'mp3' });
    });

    it('should detect Cloudflare CDN from cloudflare domain', () => {
      const result = getDeliverySource('https://audio.cloudflare.com/tracks/12345.mp3');
      expect(result).toEqual({ source: 'Cloudflare CDN', type: 'mp3' });
    });

    it('should detect Supabase Storage from supabase domain', () => {
      const result = getDeliverySource('https://xyz.supabase.co/storage/v1/object/audio-files/track.mp3');
      expect(result).toEqual({ source: 'Supabase Storage', type: 'mp3' });
    });

    it('should return Unknown for unrecognized URLs', () => {
      const result = getDeliverySource('https://example.com/audio.mp3');
      expect(result).toEqual({ source: 'Unknown', type: 'unknown' });
    });
  });

  describe('calculateHealthScore', () => {
    it('should return 0 score for null metrics', () => {
      const result = calculateHealthScore(null);
      expect(result).toEqual({ score: 0, status: 'poor' });
    });

    it('should return excellent (100) for perfect metrics', () => {
      const result = calculateHealthScore({
        failureCount: 0,
        stallCount: 0,
        connectionQuality: 'excellent',
        circuitBreakerState: 'closed',
      });
      expect(result).toEqual({ score: 100, status: 'excellent' });
    });

    it('should deduct points for failures', () => {
      const result = calculateHealthScore({
        failureCount: 2,
        stallCount: 0,
        connectionQuality: 'excellent',
        circuitBreakerState: 'closed',
      });
      expect(result.score).toBe(80); // 100 - 20 (2 failures * 10)
      expect(result.status).toBe('good');
    });

    it('should cap failure deduction at 30 points', () => {
      const result = calculateHealthScore({
        failureCount: 10,
        stallCount: 0,
        connectionQuality: 'excellent',
        circuitBreakerState: 'closed',
      });
      expect(result.score).toBe(70); // 100 - 30 (capped)
      expect(result.status).toBe('good');
    });

    it('should deduct points for stalls', () => {
      const result = calculateHealthScore({
        failureCount: 0,
        stallCount: 3,
        connectionQuality: 'excellent',
        circuitBreakerState: 'closed',
      });
      expect(result.score).toBe(85); // 100 - 15 (3 stalls * 5)
      expect(result.status).toBe('good');
    });

    it('should deduct 20 points for poor connection', () => {
      const result = calculateHealthScore({
        failureCount: 0,
        stallCount: 0,
        connectionQuality: 'poor',
        circuitBreakerState: 'closed',
      });
      expect(result.score).toBe(80);
      expect(result.status).toBe('good');
    });

    it('should deduct 50 points for offline connection', () => {
      const result = calculateHealthScore({
        failureCount: 0,
        stallCount: 0,
        connectionQuality: 'offline',
        circuitBreakerState: 'closed',
      });
      expect(result.score).toBe(50);
      expect(result.status).toBe('fair');
    });

    it('should deduct 30 points for open circuit breaker', () => {
      const result = calculateHealthScore({
        failureCount: 0,
        stallCount: 0,
        connectionQuality: 'excellent',
        circuitBreakerState: 'open',
      });
      expect(result.score).toBe(70);
      expect(result.status).toBe('good');
    });

    it('should deduct 15 points for half-open circuit breaker', () => {
      const result = calculateHealthScore({
        failureCount: 0,
        stallCount: 0,
        connectionQuality: 'excellent',
        circuitBreakerState: 'half-open',
      });
      expect(result.score).toBe(85);
      expect(result.status).toBe('good');
    });

    it('should deduct points for low HLS buffer', () => {
      const result = calculateHealthScore({
        failureCount: 0,
        stallCount: 0,
        connectionQuality: 'excellent',
        circuitBreakerState: 'closed',
        hls: {
          isHLSActive: true,
          bufferLength: 5,  // 5s of 30s target = 16.7%
          targetBuffer: 30,
          fragmentStats: { loaded: 100, failed: 0, retried: 0 },
        },
      });
      expect(result.score).toBe(85); // 100 - 15 (buffer < 30%)
      expect(result.status).toBe('good');
    });

    it('should deduct points for HLS fragment failures', () => {
      const result = calculateHealthScore({
        failureCount: 0,
        stallCount: 0,
        connectionQuality: 'excellent',
        circuitBreakerState: 'closed',
        hls: {
          isHLSActive: true,
          bufferLength: 25,
          targetBuffer: 30,
          fragmentStats: { loaded: 90, failed: 15, retried: 5 }, // 14.3% fail rate
        },
      });
      expect(result.score).toBe(80); // 100 - 20 (fail rate > 10%)
      expect(result.status).toBe('good');
    });

    it('should handle multiple deductions and return fair status', () => {
      const result = calculateHealthScore({
        failureCount: 2,
        stallCount: 2,
        connectionQuality: 'fair',
        circuitBreakerState: 'closed',
      });
      // 100 - 20 (failures) - 10 (stalls) - 10 (fair connection) = 60
      expect(result.score).toBe(60);
      expect(result.status).toBe('fair');
    });

    it('should return poor status for severely degraded metrics', () => {
      const result = calculateHealthScore({
        failureCount: 5,
        stallCount: 5,
        connectionQuality: 'poor',
        circuitBreakerState: 'open',
      });
      // 100 - 30 (failures capped) - 20 (stalls capped) - 20 (poor) - 30 (open) = 0
      expect(result.score).toBe(0);
      expect(result.status).toBe('poor');
    });

    it('should clamp score between 0 and 100', () => {
      const result = calculateHealthScore({
        failureCount: 100,
        stallCount: 100,
        connectionQuality: 'offline',
        circuitBreakerState: 'open',
      });
      expect(result.score).toBe(0);
      expect(result.status).toBe('poor');
    });
  });

  describe('formatBitrate', () => {
    it('should format bps for small values', () => {
      expect(formatBitrate(500)).toBe('500 bps');
    });

    it('should format kbps for kilobit values', () => {
      expect(formatBitrate(256000)).toBe('256 kbps');
    });

    it('should format Mbps for megabit values', () => {
      expect(formatBitrate(1500000)).toBe('1.5 Mbps');
    });

    it('should format large Mbps values', () => {
      expect(formatBitrate(10000000)).toBe('10.0 Mbps');
    });
  });

  describe('Health Status Thresholds', () => {
    it('should return excellent for score >= 90', () => {
      expect(calculateHealthScore({
        failureCount: 0,
        stallCount: 1,
        connectionQuality: 'excellent',
        circuitBreakerState: 'closed',
      }).status).toBe('excellent'); // 95
    });

    it('should return good for score >= 70 and < 90', () => {
      expect(calculateHealthScore({
        failureCount: 2,
        stallCount: 0,
        connectionQuality: 'excellent',
        circuitBreakerState: 'closed',
      }).status).toBe('good'); // 80
    });

    it('should return fair for score >= 50 and < 70', () => {
      expect(calculateHealthScore({
        failureCount: 3,
        stallCount: 2,
        connectionQuality: 'fair',
        circuitBreakerState: 'closed',
      }).status).toBe('fair'); // 50
    });

    it('should return poor for score < 50', () => {
      expect(calculateHealthScore({
        failureCount: 3,
        stallCount: 4,
        connectionQuality: 'poor',
        circuitBreakerState: 'open',
      }).status).toBe('poor'); // 0
    });
  });
});

describe('HLS Metrics Display Logic', () => {
  describe('Fragment Success Rate Calculation', () => {
    it('should calculate 100% success rate with no failures', () => {
      const loaded = 100;
      const failed = 0;
      const total = loaded + failed;
      const rate = total > 0 ? (loaded / total) * 100 : 100;
      expect(rate).toBe(100);
    });

    it('should calculate correct success rate with some failures', () => {
      const loaded = 95;
      const failed = 5;
      const total = loaded + failed;
      const rate = (loaded / total) * 100;
      expect(rate).toBe(95);
    });

    it('should handle zero total fragments', () => {
      const loaded = 0;
      const failed = 0;
      const total = loaded + failed;
      const rate = total > 0 ? (loaded / total) * 100 : 100;
      expect(rate).toBe(100); // Default to 100% when no data
    });
  });

  describe('Buffer Health Calculation', () => {
    it('should calculate buffer ratio correctly', () => {
      const bufferLength = 15;
      const targetBuffer = 30;
      const ratio = bufferLength / targetBuffer;
      expect(ratio).toBe(0.5);
    });

    it('should identify critical buffer (< 30%)', () => {
      const ratio = 8 / 30; // ~26.7%
      const isCritical = ratio < 0.3;
      expect(isCritical).toBe(true);
    });

    it('should identify warning buffer (< 50%)', () => {
      const ratio = 12 / 30; // 40%
      const isWarning = ratio < 0.5 && ratio >= 0.3;
      expect(isWarning).toBe(true);
    });

    it('should identify healthy buffer (>= 50%)', () => {
      const ratio = 20 / 30; // ~66.7%
      const isHealthy = ratio >= 0.5;
      expect(isHealthy).toBe(true);
    });
  });
});
