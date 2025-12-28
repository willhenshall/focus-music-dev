/**
 * Unit tests for playerPerf.ts TTFA instrumentation
 * 
 * These tests verify the terminal state guard behavior that prevents
 * false negatives where both success and failure events are recorded
 * for the same requestId.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  perfStart,
  perfMark,
  perfSuccess,
  perfFail,
  getPerfEvents,
  clearPerfEvents,
  getActiveEvent,
  getLatestEvent,
  isTerminal,
} from '../playerPerf';

describe('playerPerf - Terminal State Guard', () => {
  beforeEach(() => {
    // Clear all events and terminal state before each test
    clearPerfEvents();
    // Mock performance.now() for consistent tests
    vi.spyOn(performance, 'now').mockReturnValue(1000);
  });

  describe('perfSuccess prevents subsequent perfFail', () => {
    it('should ignore perfFail after perfSuccess has been called', () => {
      const requestId = 'test-req-1';
      
      // Start an event
      perfStart({
        requestId,
        triggerType: 'channel_change',
        clickAt: 0,
      });
      
      // Mark as success first
      const successResult = perfSuccess(requestId, { audioType: 'hls' });
      expect(successResult).toBe(true);
      
      // Try to mark as failure after success
      const failResult = perfFail(requestId, 'loading_timeout');
      expect(failResult).toBe(false);
      
      // Verify only one event exists and it's a success
      const events = getPerfEvents();
      expect(events).toHaveLength(1);
      expect(events[0].success).toBe(true);
      expect(events[0].error).toBeUndefined();
    });

    it('should mark the event as terminal after perfSuccess', () => {
      const requestId = 'test-req-2';
      
      perfStart({
        requestId,
        triggerType: 'energy_change',
        clickAt: 0,
      });
      
      expect(isTerminal(requestId)).toBe(false);
      
      perfSuccess(requestId);
      
      expect(isTerminal(requestId)).toBe(true);
    });
  });

  describe('perfFail prevents subsequent perfSuccess', () => {
    it('should ignore perfSuccess after perfFail has been called', () => {
      const requestId = 'test-req-3';
      
      // Start an event
      perfStart({
        requestId,
        triggerType: 'channel_change',
        clickAt: 0,
      });
      
      // Mark as failure first
      const failResult = perfFail(requestId, 'loading_timeout');
      expect(failResult).toBe(true);
      
      // Try to mark as success after failure
      const successResult = perfSuccess(requestId, { audioType: 'hls' });
      expect(successResult).toBe(false);
      
      // Verify only one event exists and it's a failure
      const events = getPerfEvents();
      expect(events).toHaveLength(1);
      expect(events[0].success).toBe(false);
      expect(events[0].error).toBe('loading_timeout');
    });

    it('should mark the event as terminal after perfFail', () => {
      const requestId = 'test-req-4';
      
      perfStart({
        requestId,
        triggerType: 'play',
        clickAt: 0,
      });
      
      expect(isTerminal(requestId)).toBe(false);
      
      perfFail(requestId, 'network_error');
      
      expect(isTerminal(requestId)).toBe(true);
    });
  });

  describe('repeated calls are idempotent', () => {
    it('should not allow multiple perfSuccess calls', () => {
      const requestId = 'test-req-5';
      
      perfStart({
        requestId,
        triggerType: 'channel_change',
        clickAt: 0,
      });
      
      // First call should succeed
      vi.spyOn(performance, 'now').mockReturnValue(1000);
      const result1 = perfSuccess(requestId, { audioType: 'hls' });
      expect(result1).toBe(true);
      
      // Subsequent calls should return false
      vi.spyOn(performance, 'now').mockReturnValue(2000);
      const result2 = perfSuccess(requestId, { audioType: 'mp3' });
      expect(result2).toBe(false);
      
      const result3 = perfSuccess(requestId);
      expect(result3).toBe(false);
      
      // Should have exactly one event with original ttfaMs
      const events = getPerfEvents();
      expect(events).toHaveLength(1);
      expect(events[0].ttfaMs).toBe(1000); // 1000 - 0 = 1000
      expect(events[0].audioType).toBe('hls'); // Original type, not overwritten
    });

    it('should not allow multiple perfFail calls', () => {
      const requestId = 'test-req-6';
      
      perfStart({
        requestId,
        triggerType: 'energy_change',
        clickAt: 0,
      });
      
      // First call should succeed
      const result1 = perfFail(requestId, 'loading_timeout');
      expect(result1).toBe(true);
      
      // Subsequent calls should return false
      const result2 = perfFail(requestId, 'network_error');
      expect(result2).toBe(false);
      
      // Should have exactly one event with original error
      const events = getPerfEvents();
      expect(events).toHaveLength(1);
      expect(events[0].error).toBe('loading_timeout'); // Original error, not overwritten
    });
  });

  describe('terminal state stability', () => {
    it('should maintain terminal state after clearPerfEvents', () => {
      const requestId = 'test-req-7';
      
      perfStart({
        requestId,
        triggerType: 'channel_change',
        clickAt: 0,
      });
      
      perfSuccess(requestId);
      expect(isTerminal(requestId)).toBe(true);
      
      // Clear events should also clear terminal state
      clearPerfEvents();
      
      // Terminal state should be cleared
      expect(isTerminal(requestId)).toBe(false);
      
      // Events should be empty
      expect(getPerfEvents()).toHaveLength(0);
    });

    it('should handle interleaved requestIds correctly', () => {
      const requestId1 = 'test-req-8a';
      const requestId2 = 'test-req-8b';
      
      // Start both events
      perfStart({
        requestId: requestId1,
        triggerType: 'channel_change',
        clickAt: 0,
      });
      
      perfStart({
        requestId: requestId2,
        triggerType: 'energy_change',
        clickAt: 100,
      });
      
      // Complete first as success
      perfSuccess(requestId1);
      
      // Complete second as failure
      perfFail(requestId2, 'timeout');
      
      // Both should be terminal
      expect(isTerminal(requestId1)).toBe(true);
      expect(isTerminal(requestId2)).toBe(true);
      
      // Attempting to swap states should fail
      expect(perfFail(requestId1, 'some_error')).toBe(false);
      expect(perfSuccess(requestId2)).toBe(false);
      
      // Verify events are correct
      const events = getPerfEvents();
      expect(events).toHaveLength(2);
      
      const event1 = events.find(e => e.requestId === requestId1);
      const event2 = events.find(e => e.requestId === requestId2);
      
      expect(event1?.success).toBe(true);
      expect(event2?.success).toBe(false);
      expect(event2?.error).toBe('timeout');
    });
  });

  describe('no requestId ends up in both success and failure states', () => {
    it('should guarantee mutual exclusivity of success and failure', () => {
      // This is the core invariant: for any requestId, there can be at most
      // ONE terminal event, and it's either success OR failure, never both.
      
      const requestIds = ['req-a', 'req-b', 'req-c', 'req-d'];
      
      // Start all events
      requestIds.forEach((id, i) => {
        perfStart({
          requestId: id,
          triggerType: 'channel_change',
          clickAt: i * 100,
        });
      });
      
      // Race condition simulation: try to call both success and fail on each
      // In real code, this could happen if timeout fires just as audio starts
      requestIds.forEach((id, i) => {
        if (i % 2 === 0) {
          // Even: success first, then try fail
          perfSuccess(id);
          perfFail(id, 'should_be_ignored');
        } else {
          // Odd: fail first, then try success
          perfFail(id, 'real_error');
          perfSuccess(id);
        }
      });
      
      const events = getPerfEvents();
      
      // Should have exactly 4 events (one per requestId)
      expect(events).toHaveLength(4);
      
      // Group events by requestId
      const eventsByRequestId = new Map<string, typeof events>();
      events.forEach(e => {
        const existing = eventsByRequestId.get(e.requestId) || [];
        existing.push(e);
        eventsByRequestId.set(e.requestId, existing);
      });
      
      // Each requestId should have exactly ONE event
      eventsByRequestId.forEach((evts, id) => {
        expect(evts.length).toBe(1);
        
        const evt = evts[0];
        // Event must be either success or failure, not both
        if (evt.success === true) {
          expect(evt.error).toBeUndefined();
        } else {
          expect(evt.success).toBe(false);
          expect(evt.error).toBeDefined();
        }
      });
      
      // Verify the specific outcomes
      const evenEvents = events.filter(e => ['req-a', 'req-c'].includes(e.requestId));
      const oddEvents = events.filter(e => ['req-b', 'req-d'].includes(e.requestId));
      
      evenEvents.forEach(e => {
        expect(e.success).toBe(true);
        expect(e.error).toBeUndefined();
      });
      
      oddEvents.forEach(e => {
        expect(e.success).toBe(false);
        expect(e.error).toBe('real_error');
      });
    });
  });

  describe('perfMark behavior after terminal', () => {
    it('should silently ignore perfMark calls after event is terminal', () => {
      const requestId = 'test-req-mark';
      
      perfStart({
        requestId,
        triggerType: 'channel_change',
        clickAt: 0,
      });
      
      // Add a mark before completing
      vi.spyOn(performance, 'now').mockReturnValue(500);
      perfMark(requestId, 'playlistReadyAt');
      
      // Complete the event
      vi.spyOn(performance, 'now').mockReturnValue(1000);
      perfSuccess(requestId);
      
      // Try to add more marks (should be silently ignored since event moved out of activeEvents)
      vi.spyOn(performance, 'now').mockReturnValue(2000);
      perfMark(requestId, 'manifestParsedAt');
      
      const events = getPerfEvents();
      expect(events).toHaveLength(1);
      expect(events[0].playlistReadyAt).toBe(500);
      // manifestParsedAt should not be present (event was already completed)
      expect(events[0].manifestParsedAt).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should return false when perfSuccess is called on unknown requestId', () => {
      const result = perfSuccess('unknown-request-id');
      expect(result).toBe(false);
      expect(getPerfEvents()).toHaveLength(0);
    });

    it('should return false when perfFail is called on unknown requestId', () => {
      const result = perfFail('unknown-request-id', 'some_error');
      expect(result).toBe(false);
      expect(getPerfEvents()).toHaveLength(0);
    });

    it('should handle empty requestId gracefully', () => {
      perfStart({
        requestId: '',
        triggerType: 'play',
        clickAt: 0,
      });
      
      const result = perfSuccess('');
      expect(result).toBe(true);
      
      // Empty string is a valid requestId
      expect(isTerminal('')).toBe(true);
    });
  });
});

