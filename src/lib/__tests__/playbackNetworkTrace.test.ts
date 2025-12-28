/**
 * Unit tests for playbackNetworkTrace.ts - Playback Network Trace instrumentation
 * 
 * These tests verify:
 * 1. beginTrace creates an active trace
 * 2. Multiple concurrent traces isolate events by requestId
 * 3. endTrace finalizes and prevents further recording
 * 4. summarizeTrace computes correct totals
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  beginTrace,
  endTrace,
  recordNetworkEventToAll,
  hasActiveTraces,
  getActiveTraceIds,
  getTrace,
  clearTrace,
  summarizeTrace,
  getAllTraces,
  getLatestTrace,
  clearAllTraces,
  getOverallSummary,
  parseUrl,
  type NetworkEvent,
  type TraceMeta,
} from '../playbackNetworkTrace';

// Mock import.meta.env.DEV
vi.mock('../playbackNetworkTrace', async () => {
  // Reset module state before each import
  const actual = await vi.importActual<typeof import('../playbackNetworkTrace')>('../playbackNetworkTrace');
  return actual;
});

// Helper to create a network event
function createNetworkEvent(overrides: Partial<NetworkEvent> = {}): NetworkEvent {
  return {
    ts: performance.now(),
    method: 'GET',
    url: 'https://example.supabase.co/rest/v1/channels',
    status: 200,
    durationMs: 50,
    hostname: 'example.supabase.co',
    pathname: '/rest/v1/channels',
    ...overrides,
  };
}

describe('playbackNetworkTrace', () => {
  beforeEach(() => {
    // Clear all traces before each test
    clearAllTraces();
    // Mock performance.now() for consistent tests
    vi.spyOn(performance, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('beginTrace', () => {
    it('should create an active trace', () => {
      const requestId = 'req-1';
      
      beginTrace(requestId, { triggerType: 'channel_change' });
      
      expect(hasActiveTraces()).toBe(true);
      expect(getActiveTraceIds()).toContain(requestId);
      
      const trace = getTrace(requestId);
      expect(trace).toBeDefined();
      expect(trace?.requestId).toBe(requestId);
      expect(trace?.active).toBe(true);
      expect(trace?.meta.triggerType).toBe('channel_change');
    });

    it('should store all provided metadata', () => {
      const requestId = 'req-2';
      const meta: TraceMeta = {
        triggerType: 'energy_change',
        channelId: 'ch-123',
        channelName: 'Focus Flow',
        energyLevel: 'high',
        engineType: 'streaming',
      };
      
      beginTrace(requestId, meta);
      
      const trace = getTrace(requestId);
      expect(trace?.meta).toEqual(meta);
    });

    it('should not restart a terminated trace', () => {
      const requestId = 'req-3';
      
      beginTrace(requestId, { triggerType: 'play' });
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      // Try to restart the same requestId
      beginTrace(requestId, { triggerType: 'resume' });
      
      // Should NOT be active
      expect(hasActiveTraces()).toBe(false);
      
      // The completed trace should remain unchanged
      const trace = getTrace(requestId);
      expect(trace?.meta.triggerType).toBe('play'); // Original, not 'resume'
    });
  });

  describe('endTrace', () => {
    it('should finalize trace and compute summary', () => {
      const requestId = 'req-4';
      
      beginTrace(requestId);
      
      // Simulate some network events
      recordNetworkEventToAll(createNetworkEvent({ durationMs: 100 }));
      recordNetworkEventToAll(createNetworkEvent({ durationMs: 200 }));
      
      vi.spyOn(performance, 'now').mockReturnValue(1500);
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      const trace = getTrace(requestId);
      expect(trace?.active).toBe(false);
      expect(trace?.outcome?.outcome).toBe('success');
      expect(trace?.outcome?.ttfaMs).toBe(500);
      expect(trace?.summary).toBeDefined();
      expect(trace?.summary?.totalRequests).toBe(2);
      expect(trace?.summary?.totalDurationMs).toBe(300);
    });

    it('should prevent further recording after endTrace', () => {
      const requestId = 'req-5';
      
      beginTrace(requestId);
      recordNetworkEventToAll(createNetworkEvent());
      endTrace(requestId, { outcome: 'success', ttfaMs: 300 });
      
      // Try to record more events
      recordNetworkEventToAll(createNetworkEvent());
      recordNetworkEventToAll(createNetworkEvent());
      
      const trace = getTrace(requestId);
      expect(trace?.events.length).toBe(1); // Only the first event
    });

    it('should handle failure outcome', () => {
      const requestId = 'req-6';
      
      beginTrace(requestId);
      endTrace(requestId, { outcome: 'fail', reason: 'loading_timeout' });
      
      const trace = getTrace(requestId);
      expect(trace?.outcome?.outcome).toBe('fail');
      expect(trace?.outcome?.reason).toBe('loading_timeout');
    });

    it('should be idempotent (multiple endTrace calls)', () => {
      const requestId = 'req-7';
      
      beginTrace(requestId);
      recordNetworkEventToAll(createNetworkEvent({ durationMs: 100 }));
      
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      // Try to end again with different outcome
      endTrace(requestId, { outcome: 'fail', reason: 'should_be_ignored' });
      
      const trace = getTrace(requestId);
      expect(trace?.outcome?.outcome).toBe('success'); // First outcome wins
      expect(trace?.outcome?.reason).toBeUndefined();
    });
  });

  describe('concurrent traces isolation', () => {
    it('should isolate events between concurrent traces', () => {
      const requestId1 = 'req-8a';
      const requestId2 = 'req-8b';
      
      // Start both traces
      beginTrace(requestId1, { channelId: 'ch-1' });
      beginTrace(requestId2, { channelId: 'ch-2' });
      
      expect(getActiveTraceIds()).toHaveLength(2);
      
      // Record events (will go to both)
      recordNetworkEventToAll(createNetworkEvent({ url: 'https://a.com/1' }));
      
      // End first trace
      endTrace(requestId1, { outcome: 'success', ttfaMs: 300 });
      
      // Record more events (should only go to second trace)
      recordNetworkEventToAll(createNetworkEvent({ url: 'https://a.com/2' }));
      recordNetworkEventToAll(createNetworkEvent({ url: 'https://a.com/3' }));
      
      // End second trace
      endTrace(requestId2, { outcome: 'success', ttfaMs: 500 });
      
      // Verify isolation
      const trace1 = getTrace(requestId1);
      const trace2 = getTrace(requestId2);
      
      expect(trace1?.events.length).toBe(1); // Only first event
      expect(trace2?.events.length).toBe(3); // All three events
    });

    it('should handle rapid start-end cycles', () => {
      for (let i = 0; i < 10; i++) {
        const requestId = `req-rapid-${i}`;
        beginTrace(requestId);
        recordNetworkEventToAll(createNetworkEvent({ durationMs: i * 10 }));
        endTrace(requestId, { outcome: 'success', ttfaMs: i * 100 });
      }
      
      const traces = getAllTraces();
      expect(traces.length).toBe(10);
      
      // Verify each trace has its own event
      traces.forEach((trace, i) => {
        expect(trace.events.length).toBe(1);
      });
    });
  });

  describe('summarizeTrace', () => {
    it('should compute correct totals', () => {
      const requestId = 'req-9';
      
      beginTrace(requestId);
      
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://supabase.co/rest/v1/channels',
        hostname: 'supabase.co',
        pathname: '/rest/v1/channels',
        durationMs: 100,
      }));
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://supabase.co/rest/v1/tracks',
        hostname: 'supabase.co',
        pathname: '/rest/v1/tracks',
        durationMs: 150,
      }));
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://r2.cloudflarestorage.com/audio/track.mp3',
        hostname: 'r2.cloudflarestorage.com',
        pathname: '/audio/track.mp3',
        durationMs: 500,
      }));
      
      endTrace(requestId, { outcome: 'success', ttfaMs: 800 });
      
      const summary = summarizeTrace(requestId);
      
      expect(summary).toBeDefined();
      expect(summary?.totalRequests).toBe(3);
      expect(summary?.totalDurationMs).toBe(750);
      
      // Verify hostname grouping
      expect(summary?.byHostname['supabase.co']).toEqual({ count: 2, totalMs: 250 });
      expect(summary?.byHostname['r2.cloudflarestorage.com']).toEqual({ count: 1, totalMs: 500 });
      
      // Verify endpoint counting
      expect(summary?.byEndpoint['/rest/v1/channels']).toBe(1);
      expect(summary?.byEndpoint['/rest/v1/tracks']).toBe(1);
      expect(summary?.byEndpoint['/audio/track.mp3']).toBe(1);
      
      // Verify slowest requests (sorted by duration desc)
      expect(summary?.slowestRequests[0].durationMs).toBe(500);
    });

    it('should include top N slowest requests', () => {
      const requestId = 'req-10';
      
      beginTrace(requestId);
      
      // Add 10 events with different durations
      for (let i = 0; i < 10; i++) {
        recordNetworkEventToAll(createNetworkEvent({
          url: `https://api.com/endpoint-${i}`,
          hostname: 'api.com',
          pathname: `/endpoint-${i}`,
          durationMs: (i + 1) * 100, // 100, 200, 300, ..., 1000
        }));
      }
      
      endTrace(requestId, { outcome: 'success', ttfaMs: 2000 });
      
      const summary = summarizeTrace(requestId);
      
      // Should have top 5 slowest
      expect(summary?.slowestRequests.length).toBe(5);
      expect(summary?.slowestRequests[0].durationMs).toBe(1000);
      expect(summary?.slowestRequests[1].durationMs).toBe(900);
      expect(summary?.slowestRequests[4].durationMs).toBe(600);
    });
  });

  describe('ring buffer behavior', () => {
    it('should keep only MAX_TRACES (50) traces', () => {
      // Create 60 traces
      for (let i = 0; i < 60; i++) {
        const requestId = `req-ring-${i}`;
        beginTrace(requestId);
        endTrace(requestId, { outcome: 'success', ttfaMs: 100 });
      }
      
      const traces = getAllTraces();
      expect(traces.length).toBe(50);
      
      // Oldest traces should be dropped
      expect(getTrace('req-ring-0')).toBeUndefined();
      expect(getTrace('req-ring-9')).toBeUndefined();
      
      // Newest traces should be kept
      expect(getTrace('req-ring-59')).toBeDefined();
      expect(getTrace('req-ring-10')).toBeDefined();
    });
  });

  describe('getLatestTrace', () => {
    it('should return the most recent completed trace', () => {
      beginTrace('req-a');
      endTrace('req-a', { outcome: 'success', ttfaMs: 100 });
      
      beginTrace('req-b');
      endTrace('req-b', { outcome: 'success', ttfaMs: 200 });
      
      const latest = getLatestTrace();
      expect(latest?.requestId).toBe('req-b');
    });

    it('should return undefined when no traces exist', () => {
      expect(getLatestTrace()).toBeUndefined();
    });
  });

  describe('clearTrace', () => {
    it('should remove a specific trace', () => {
      beginTrace('req-x');
      endTrace('req-x', { outcome: 'success', ttfaMs: 100 });
      
      beginTrace('req-y');
      endTrace('req-y', { outcome: 'success', ttfaMs: 200 });
      
      clearTrace('req-x');
      
      expect(getTrace('req-x')).toBeUndefined();
      expect(getTrace('req-y')).toBeDefined();
    });
  });

  describe('getOverallSummary', () => {
    it('should compute averages across all traces', () => {
      // Create 3 traces with different request counts
      for (let i = 1; i <= 3; i++) {
        const requestId = `req-summary-${i}`;
        beginTrace(requestId);
        for (let j = 0; j < i * 2; j++) {
          recordNetworkEventToAll(createNetworkEvent({ durationMs: 100 }));
        }
        endTrace(requestId, { outcome: 'success', ttfaMs: i * 100 });
      }
      
      const overall = getOverallSummary();
      expect(overall.traceCount).toBe(3);
      // Trace 1: 2 events, Trace 2: 4 events, Trace 3: 6 events = 12 total / 3 = 4 avg
      expect(overall.avgRequestsPerTrace).toBe(4);
    });
  });

  describe('parseUrl', () => {
    it('should extract hostname and pathname from full URLs', () => {
      const result = parseUrl('https://api.supabase.co/rest/v1/channels?select=*');
      expect(result.hostname).toBe('api.supabase.co');
      expect(result.pathname).toBe('/rest/v1/channels');
    });

    it('should handle URLs without path', () => {
      const result = parseUrl('https://example.com');
      expect(result.hostname).toBe('example.com');
      expect(result.pathname).toBe('/');
    });

    it('should handle malformed URLs gracefully', () => {
      const result = parseUrl('not-a-valid-url');
      expect(result.hostname).toBe('unknown');
      expect(result.pathname).toBe('not-a-valid-url');
    });
  });

  describe('error handling', () => {
    it('should record network errors with ERR status', () => {
      const requestId = 'req-err';
      
      beginTrace(requestId);
      
      recordNetworkEventToAll({
        ts: 1000,
        method: 'GET',
        url: 'https://api.com/fail',
        status: 'ERR',
        durationMs: 5000,
        errorMessage: 'Network timeout',
        hostname: 'api.com',
        pathname: '/fail',
      });
      
      endTrace(requestId, { outcome: 'fail', reason: 'network_error' });
      
      const trace = getTrace(requestId);
      expect(trace?.events[0].status).toBe('ERR');
      expect(trace?.events[0].errorMessage).toBe('Network timeout');
    });
  });
});

