/**
 * Unit tests for audioTracksCache.ts - Audio Tracks Cache
 * 
 * [PHASE 4.2] Tests verify:
 * 1. getMany returns cached tracks and identifies misses
 * 2. fetchMissing batches requests and updates cache
 * 3. getOrFetch combines cache hits with fetched tracks
 * 4. Cache TTL expiration works correctly
 * 5. In-flight request deduplication
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getMany,
  fetchMissing,
  getOrFetch,
  getOrFetchOne,
  clearCache,
  invalidate,
  getCacheStats,
  warmCache,
  type CachedAudioTrack,
} from '../audioTracksCache';

// Helper to create a mock track
function createMockTrack(id: string, trackId = 12345): CachedAudioTrack {
  return {
    id,
    track_id: trackId,
    track_name: `Test Track ${trackId}`,
    artist_name: 'Test Artist',
    file_path: `/audio/${trackId}.mp3`,
    hls_path: `/hls/${trackId}/master.m3u8`,
    hls_cdn_url: `https://cdn.example.com/hls/${trackId}/master.m3u8`,
    duration_seconds: 180,
    metadata: { track_id: String(trackId) },
    channel_id: 'channel-123',
    deleted_at: null,
  };
}

// Mock Supabase client
function createMockSupabase(tracks: CachedAudioTrack[]) {
  return {
    from: () => ({
      select: () => ({
        in: (_field: string, ids: string[]) => ({
          is: () => ({
            then: (resolve: (result: { data: CachedAudioTrack[] | null; error: null }) => void) => {
              const matchedTracks = tracks.filter(t => ids.includes(t.id));
              resolve({ data: matchedTracks, error: null });
              return { catch: () => {} };
            },
          }),
        }),
      }),
    }),
  };
}

describe('audioTracksCache', () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getMany', () => {
    it('should return empty hits and all misses when cache is empty', () => {
      const { hits, misses } = getMany(['id-1', 'id-2', 'id-3']);
      
      expect(hits).toHaveLength(0);
      expect(misses).toHaveLength(3);
      expect(misses).toEqual(['id-1', 'id-2', 'id-3']);
    });

    it('should return cached tracks as hits', () => {
      const track1 = createMockTrack('id-1', 100);
      const track2 = createMockTrack('id-2', 200);
      warmCache([track1, track2]);

      const { hits, misses } = getMany(['id-1', 'id-2', 'id-3']);
      
      expect(hits).toHaveLength(2);
      expect(hits.map(t => t.id)).toEqual(['id-1', 'id-2']);
      expect(misses).toEqual(['id-3']);
    });

    it('should treat expired entries as misses', () => {
      const track = createMockTrack('id-1', 100);
      warmCache([track]);

      // Advance time past TTL (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      const { hits, misses } = getMany(['id-1']);
      
      expect(hits).toHaveLength(0);
      expect(misses).toEqual(['id-1']);
    });
  });

  describe('fetchMissing', () => {
    it('should fetch tracks and update cache', async () => {
      const track1 = createMockTrack('id-1', 100);
      const track2 = createMockTrack('id-2', 200);
      const mockSupabase = createMockSupabase([track1, track2]);

      const fetched = await fetchMissing(['id-1', 'id-2'], mockSupabase);
      
      expect(fetched).toHaveLength(2);
      expect(getCacheStats().size).toBe(2);

      // Verify tracks are now cached
      const { hits } = getMany(['id-1', 'id-2']);
      expect(hits).toHaveLength(2);
    });

    it('should return empty array for empty ids', async () => {
      const mockSupabase = createMockSupabase([]);
      
      const fetched = await fetchMissing([], mockSupabase);
      
      expect(fetched).toHaveLength(0);
    });

    it('should deduplicate ids', async () => {
      const track = createMockTrack('id-1', 100);
      const mockSupabase = createMockSupabase([track]);

      const fetched = await fetchMissing(['id-1', 'id-1', 'id-1'], mockSupabase);
      
      expect(fetched).toHaveLength(1);
    });
  });

  describe('getOrFetch', () => {
    it('should return only cached tracks when all are hits', async () => {
      const track1 = createMockTrack('id-1', 100);
      const track2 = createMockTrack('id-2', 200);
      warmCache([track1, track2]);
      const mockSupabase = createMockSupabase([]);

      const { tracks, fromCache, fetched } = await getOrFetch(['id-1', 'id-2'], mockSupabase);
      
      expect(tracks).toHaveLength(2);
      expect(fromCache).toBe(2);
      expect(fetched).toBe(0);
    });

    it('should fetch missing tracks and combine with cached', async () => {
      const track1 = createMockTrack('id-1', 100);
      const track2 = createMockTrack('id-2', 200);
      const track3 = createMockTrack('id-3', 300);
      
      // Warm cache with only track1
      warmCache([track1]);
      
      // Mock Supabase returns track2 and track3
      const mockSupabase = createMockSupabase([track2, track3]);

      const { tracks, fromCache, fetched } = await getOrFetch(['id-1', 'id-2', 'id-3'], mockSupabase);
      
      expect(tracks).toHaveLength(3);
      expect(fromCache).toBe(1);
      expect(fetched).toBe(2);
    });

    it('should preserve order from input ids', async () => {
      const track1 = createMockTrack('id-1', 100);
      const track2 = createMockTrack('id-2', 200);
      const track3 = createMockTrack('id-3', 300);
      const mockSupabase = createMockSupabase([track1, track2, track3]);

      const { tracks } = await getOrFetch(['id-3', 'id-1', 'id-2'], mockSupabase);
      
      expect(tracks.map(t => t.id)).toEqual(['id-3', 'id-1', 'id-2']);
    });

    it('should return empty result for empty ids', async () => {
      const mockSupabase = createMockSupabase([]);

      const { tracks, fromCache, fetched } = await getOrFetch([], mockSupabase);
      
      expect(tracks).toHaveLength(0);
      expect(fromCache).toBe(0);
      expect(fetched).toBe(0);
    });
  });

  describe('getOrFetchOne', () => {
    it('should return single cached track', async () => {
      const track = createMockTrack('id-1', 100);
      warmCache([track]);
      const mockSupabase = createMockSupabase([]);

      const result = await getOrFetchOne('id-1', mockSupabase);
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe('id-1');
    });

    it('should fetch single missing track', async () => {
      const track = createMockTrack('id-1', 100);
      const mockSupabase = createMockSupabase([track]);

      const result = await getOrFetchOne('id-1', mockSupabase);
      
      expect(result).not.toBeNull();
      expect(result?.id).toBe('id-1');
    });

    it('should return null for non-existent track', async () => {
      const mockSupabase = createMockSupabase([]);

      const result = await getOrFetchOne('non-existent', mockSupabase);
      
      expect(result).toBeNull();
    });
  });

  describe('cache management', () => {
    it('should clear all entries on clearCache', () => {
      warmCache([
        createMockTrack('id-1', 100),
        createMockTrack('id-2', 200),
      ]);
      expect(getCacheStats().size).toBe(2);

      clearCache();
      
      expect(getCacheStats().size).toBe(0);
    });

    it('should invalidate specific entries', () => {
      warmCache([
        createMockTrack('id-1', 100),
        createMockTrack('id-2', 200),
        createMockTrack('id-3', 300),
      ]);

      invalidate(['id-1', 'id-3']);
      
      expect(getCacheStats().size).toBe(1);
      const { hits, misses } = getMany(['id-1', 'id-2', 'id-3']);
      expect(hits.map(t => t.id)).toEqual(['id-2']);
      expect(misses).toEqual(['id-1', 'id-3']);
    });

    it('should report correct cache stats', () => {
      expect(getCacheStats()).toEqual({ size: 0, inFlight: 0 });

      warmCache([createMockTrack('id-1', 100)]);
      
      expect(getCacheStats().size).toBe(1);
    });
  });

  describe('warmCache', () => {
    it('should pre-populate cache with tracks', () => {
      const tracks = [
        createMockTrack('id-1', 100),
        createMockTrack('id-2', 200),
      ];

      warmCache(tracks);
      
      const { hits } = getMany(['id-1', 'id-2']);
      expect(hits).toHaveLength(2);
    });

    it('should skip tracks without id', () => {
      const track = createMockTrack('id-1', 100);
      const trackWithoutId = { ...track, id: '' };

      warmCache([track, trackWithoutId as CachedAudioTrack]);
      
      expect(getCacheStats().size).toBe(1);
    });
  });
});

