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
  detectWarnings,
  generateTraceSummaryText,
  downloadLatest,
  downloadAll,
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
      traces.forEach((trace) => {
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

  describe('detectWarnings', () => {
    it('should detect duplicate user_preferences calls', () => {
      const requestId = 'req-warn-1';
      
      beginTrace(requestId);
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://api.supabase.co/rest/v1/user_preferences',
        pathname: '/rest/v1/user_preferences',
      }));
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://api.supabase.co/rest/v1/user_preferences',
        pathname: '/rest/v1/user_preferences',
      }));
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      const trace = getTrace(requestId);
      const warnings = detectWarnings(trace!);
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.type === 'duplicate_user_preferences')).toBe(true);
    });

    it('should detect audio_tracks?select=* pattern', () => {
      const requestId = 'req-warn-2';
      
      beginTrace(requestId);
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://api.supabase.co/rest/v1/audio_tracks?select=*',
        pathname: '/rest/v1/audio_tracks',
      }));
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      const trace = getTrace(requestId);
      const warnings = detectWarnings(trace!);
      
      expect(warnings.some(w => w.type === 'audio_tracks_select_all')).toBe(true);
    });

    it('should detect duplicate slot_strategies calls', () => {
      const requestId = 'req-warn-3';
      
      beginTrace(requestId);
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://api.supabase.co/rest/v1/slot_strategies',
        pathname: '/rest/v1/slot_strategies',
      }));
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://api.supabase.co/rest/v1/slot_strategies',
        pathname: '/rest/v1/slot_strategies',
      }));
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      const trace = getTrace(requestId);
      const warnings = detectWarnings(trace!);
      
      expect(warnings.some(w => w.type === 'duplicate_slot_strategy')).toBe(true);
    });

    it('should return empty array when no warnings', () => {
      const requestId = 'req-warn-4';
      
      beginTrace(requestId);
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://cdn.com/audio/track.mp3',
        pathname: '/audio/track.mp3',
      }));
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      const trace = getTrace(requestId);
      const warnings = detectWarnings(trace!);
      
      // Should have no heuristic warnings for a simple CDN request
      expect(warnings.filter(w => w.type !== 'analytics_before_audio').length).toBe(0);
    });
  });

  describe('generateTraceSummaryText', () => {
    it('should return a human-readable summary string', () => {
      const requestId = 'req-summary-text';
      
      beginTrace(requestId, {
        triggerType: 'channel_change',
        channelName: 'Focus Flow',
        energyLevel: 'high',
      });
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://api.supabase.co/rest/v1/channels',
        hostname: 'api.supabase.co',
        pathname: '/rest/v1/channels',
        durationMs: 150,
      }));
      endTrace(requestId, { outcome: 'success', ttfaMs: 800 });
      
      const trace = getTrace(requestId);
      const text = generateTraceSummaryText(trace!);
      
      expect(text).toContain('SUCCESS');
      expect(text).toContain('TTFA:');
      expect(text).toContain('800ms');
      expect(text).toContain('channel_change');
      expect(text).toContain('Focus Flow');
      expect(text).toContain('Network:');
      expect(text).toContain('1 requests');
    });

    it('should include warnings in summary text', () => {
      const requestId = 'req-summary-text-warn';
      
      beginTrace(requestId);
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://api.supabase.co/rest/v1/user_preferences',
        pathname: '/rest/v1/user_preferences',
      }));
      recordNetworkEventToAll(createNetworkEvent({
        url: 'https://api.supabase.co/rest/v1/user_preferences',
        pathname: '/rest/v1/user_preferences',
      }));
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      const trace = getTrace(requestId);
      const text = generateTraceSummaryText(trace!);
      
      expect(text).toContain('Warnings:');
      expect(text).toContain('user_preferences');
    });

    it('should handle failure outcome', () => {
      const requestId = 'req-summary-text-fail';
      
      beginTrace(requestId);
      endTrace(requestId, { outcome: 'fail', reason: 'timeout' });
      
      const trace = getTrace(requestId);
      const text = generateTraceSummaryText(trace!);
      
      expect(text).toContain('FAIL');
    });
  });

  describe('downloadLatest', () => {
    it('should return false when no traces exist', () => {
      clearAllTraces();
      const result = downloadLatest();
      expect(result).toBe(false);
    });

    it('should create a blob and trigger download when traces exist', () => {
      const requestId = 'req-download';
      beginTrace(requestId);
      endTrace(requestId, { outcome: 'success', ttfaMs: 500 });
      
      // Mock document.createElement and other DOM methods
      const mockClick = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();
      
      const mockAnchor = {
        href: '',
        download: '',
        style: { display: '' },
        click: mockClick,
      };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);
      vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
      vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      
      const result = downloadLatest();
      
      expect(result).toBe(true);
      expect(mockClick).toHaveBeenCalled();
      expect(mockAnchor.download).toContain('playback-trace-');
      expect(mockAnchor.download).toContain('.json');
    });
  });

  describe('downloadAll', () => {
    it('should return false when no traces exist', () => {
      clearAllTraces();
      const result = downloadAll();
      expect(result).toBe(false);
    });

    it('should create a blob with all traces when traces exist', () => {
      // Create multiple traces
      beginTrace('req-all-1');
      endTrace('req-all-1', { outcome: 'success', ttfaMs: 300 });
      beginTrace('req-all-2');
      endTrace('req-all-2', { outcome: 'success', ttfaMs: 400 });
      
      const mockClick = vi.fn();
      const mockAnchor = {
        href: '',
        download: '',
        style: { display: '' },
        click: mockClick,
      };
      
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.body);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.body);
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url-all');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      
      const result = downloadAll();
      
      expect(result).toBe(true);
      expect(mockClick).toHaveBeenCalled();
      expect(mockAnchor.download).toContain('playback-traces-all-');
    });
  });

  describe('summarizeTrace includes method and pathname in slowestRequests', () => {
    it('should include method and pathname in slowest requests', () => {
      const requestId = 'req-slow-detail';
      
      beginTrace(requestId);
      recordNetworkEventToAll(createNetworkEvent({
        method: 'POST',
        url: 'https://api.supabase.co/rest/v1/rpc/my_function',
        pathname: '/rest/v1/rpc/my_function',
        durationMs: 500,
      }));
      endTrace(requestId, { outcome: 'success', ttfaMs: 600 });
      
      const summary = summarizeTrace(requestId);
      
      expect(summary?.slowestRequests[0].method).toBe('POST');
      expect(summary?.slowestRequests[0].pathname).toBe('/rest/v1/rpc/my_function');
    });
  });
});

