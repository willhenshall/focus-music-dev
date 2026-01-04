/**
 * Audio Tracks Cache - In-memory cache for playback track metadata
 * 
 * [PHASE 4.2] Reduces repeated /audio_tracks fetches during playback by:
 * 1. Caching fetched track metadata by id
 * 2. Batching multiple track requests into single queries
 * 3. Returning cached results for repeated requests
 * 
 * This module provides:
 * - getMany(ids): Returns cached tracks for given ids (cache hits only)
 * - fetchMissing(ids, supabase): Fetches missing tracks and merges into cache
 * - getOrFetch(ids, supabase): Combined get + fetch for convenience
 * - clearCache(): Clears all cached tracks
 * - invalidate(ids): Invalidates specific tracks
 */

import type { AudioTrack } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Minimal playback fields required for audio playback.
 * Must match AUDIO_TRACK_PLAYBACK_FIELDS in MusicPlayerContext.
 */
export interface CachedAudioTrack {
  id: string;
  track_id: number;
  track_name: string;
  artist_name: string | null;
  file_path: string;
  hls_path: string | null;
  hls_cdn_url: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
  channel_id: string | null;
  deleted_at: string | null;
}

/**
 * Result of a getOrFetch operation.
 */
export interface FetchResult {
  tracks: CachedAudioTrack[];
  fromCache: number;
  fetched: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Cache TTL in milliseconds (5 minutes).
 * Entries older than this are considered stale and will be re-fetched.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Maximum cache size to prevent memory bloat.
 */
const MAX_CACHE_SIZE = 1000;

/**
 * Minimal fields to select for playback.
 * Must match AUDIO_TRACK_PLAYBACK_FIELDS in MusicPlayerContext.
 */
export const AUDIO_TRACK_PLAYBACK_FIELDS = 
  'id, track_id, track_name, artist_name, file_path, hls_path, hls_cdn_url, duration_seconds, metadata, channel_id, deleted_at';

// ============================================================================
// STATE
// ============================================================================

interface CacheEntry {
  track: CachedAudioTrack;
  cachedAt: number;
}

/**
 * In-memory cache keyed by track id (UUID).
 */
const cache = new Map<string, CacheEntry>();

/**
 * In-flight requests to prevent duplicate fetches for the same ids.
 */
const inFlightRequests = new Map<string, Promise<CachedAudioTrack | null>>();

/**
 * [PHASE 5.0] Cache statistics for debugging and baseline analysis.
 */
interface CacheStats {
  hits: number;
  misses: number;
  inflightDedupHits: number;
  batchFetches: number;
}

let stats: CacheStats = {
  hits: 0,
  misses: 0,
  inflightDedupHits: 0,
  batchFetches: 0,
};

// ============================================================================
// CORE API
// ============================================================================

/**
 * Get cached tracks for the given ids.
 * Returns only cache hits; missing ids are not fetched.
 * 
 * @param ids - Array of track ids (UUIDs) to retrieve
 * @returns Object with hits (cached tracks) and misses (ids not in cache)
 */
export function getMany(ids: string[]): { hits: CachedAudioTrack[]; misses: string[] } {
  const now = Date.now();
  const hits: CachedAudioTrack[] = [];
  const misses: string[] = [];

  for (const id of ids) {
    const entry = cache.get(id);
    if (entry && (now - entry.cachedAt) < CACHE_TTL_MS) {
      hits.push(entry.track);
      stats.hits++; // [PHASE 5.0] Track cache hit
    } else {
      misses.push(id);
      stats.misses++; // [PHASE 5.0] Track cache miss
      // Remove stale entry if exists
      if (entry) {
        cache.delete(id);
      }
    }
  }

  return { hits, misses };
}

/**
 * Fetch missing tracks from Supabase and merge into cache.
 * Uses a single batched IN query for efficiency.
 * 
 * @param ids - Array of track ids (UUIDs) to fetch
 * @param supabase - Supabase client instance
 * @returns Array of fetched tracks
 */
export async function fetchMissing(
  ids: string[],
  supabase: { from: (table: string) => unknown }
): Promise<CachedAudioTrack[]> {
  if (ids.length === 0) {
    return [];
  }

  // Deduplicate and filter out already in-flight requests
  const uniqueIds = [...new Set(ids)];
  const toFetch: string[] = [];
  const inFlightPromises: Promise<CachedAudioTrack | null>[] = [];

  for (const id of uniqueIds) {
    const existing = inFlightRequests.get(id);
    if (existing) {
      inFlightPromises.push(existing);
      stats.inflightDedupHits++; // [PHASE 5.0] Track in-flight dedup hit
    } else {
      toFetch.push(id);
    }
  }

  // Fetch missing tracks in a single batch query
  let fetchedTracks: CachedAudioTrack[] = [];
  
  if (toFetch.length > 0) {
    stats.batchFetches++; // [PHASE 5.0] Track batch fetch
    
    // Create individual promises for each id to track in-flight status
    const fetchPromise = (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('audio_tracks')
          .select(AUDIO_TRACK_PLAYBACK_FIELDS)
          .in('id', toFetch)
          .is('deleted_at', null);

        if (error) {
          console.error('[AUDIO_TRACKS_CACHE] Fetch error:', error);
          return [];
        }

        return (data || []) as CachedAudioTrack[];
      } catch (err) {
        console.error('[AUDIO_TRACKS_CACHE] Fetch exception:', err);
        return [];
      }
    })();

    // Register in-flight for each id
    const sharedPromise = fetchPromise.then(tracks => {
      const byId = new Map(tracks.map(t => [t.id, t]));
      return byId;
    });

    for (const id of toFetch) {
      const individualPromise = sharedPromise.then(byId => byId.get(id) || null);
      inFlightRequests.set(id, individualPromise);
    }

    // Wait for fetch to complete
    fetchedTracks = await fetchPromise;

    // Merge into cache
    const now = Date.now();
    for (const track of fetchedTracks) {
      cache.set(track.id, { track, cachedAt: now });
      inFlightRequests.delete(track.id);
    }

    // Clean up in-flight for ids that weren't found
    for (const id of toFetch) {
      if (!fetchedTracks.find(t => t.id === id)) {
        inFlightRequests.delete(id);
      }
    }

    // Enforce max cache size (LRU-style: remove oldest entries)
    if (cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries())
        .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
      const toRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE);
      for (const [id] of toRemove) {
        cache.delete(id);
      }
    }
  }

  // Wait for any in-flight requests
  const inFlightResults = await Promise.all(inFlightPromises);
  const inFlightTracks = inFlightResults.filter((t): t is CachedAudioTrack => t !== null);

  return [...fetchedTracks, ...inFlightTracks];
}

/**
 * Get tracks from cache or fetch missing ones.
 * Convenience method that combines getMany + fetchMissing.
 * 
 * @param ids - Array of track ids (UUIDs) to retrieve
 * @param supabase - Supabase client instance
 * @returns FetchResult with all tracks and cache statistics
 */
export async function getOrFetch(
  ids: string[],
  supabase: { from: (table: string) => unknown }
): Promise<FetchResult> {
  if (ids.length === 0) {
    return { tracks: [], fromCache: 0, fetched: 0 };
  }

  const { hits, misses } = getMany(ids);
  
  if (misses.length === 0) {
    // All hits, no fetch needed
    return { tracks: hits, fromCache: hits.length, fetched: 0 };
  }

  const fetched = await fetchMissing(misses, supabase);
  
  // Combine and preserve order from input ids
  const byId = new Map<string, CachedAudioTrack>();
  for (const track of hits) {
    byId.set(track.id, track);
  }
  for (const track of fetched) {
    byId.set(track.id, track);
  }

  const orderedTracks: CachedAudioTrack[] = [];
  for (const id of ids) {
    const track = byId.get(id);
    if (track) {
      orderedTracks.push(track);
    }
  }

  return {
    tracks: orderedTracks,
    fromCache: hits.length,
    fetched: fetched.length,
  };
}

/**
 * Get a single track from cache or fetch if missing.
 * 
 * @param id - Track id (UUID) to retrieve
 * @param supabase - Supabase client instance
 * @returns The track or null if not found
 */
export async function getOrFetchOne(
  id: string,
  supabase: { from: (table: string) => unknown }
): Promise<CachedAudioTrack | null> {
  const { tracks } = await getOrFetch([id], supabase);
  return tracks[0] || null;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all cached tracks.
 */
export function clearCache(): void {
  cache.clear();
  inFlightRequests.clear();
}

/**
 * Invalidate specific tracks in the cache.
 * 
 * @param ids - Array of track ids to invalidate
 */
export function invalidate(ids: string[]): void {
  for (const id of ids) {
    cache.delete(id);
    inFlightRequests.delete(id);
  }
}

/**
 * Get cache statistics for debugging.
 * [PHASE 5.0] Extended with hit/miss counters.
 */
export function getCacheStats(): { 
  size: number; 
  inFlight: number;
  hits: number;
  misses: number;
  inflightDedupHits: number;
  batchFetches: number;
} {
  return {
    size: cache.size,
    inFlight: inFlightRequests.size,
    ...stats,
  };
}

/**
 * [PHASE 5.0] Clear cache statistics (for baseline measurement).
 * Does NOT clear the cache itself - only resets counters.
 */
export function clearCacheStats(): void {
  stats = {
    hits: 0,
    misses: 0,
    inflightDedupHits: 0,
    batchFetches: 0,
  };
}

/**
 * Pre-populate cache with tracks (useful after bulk fetches).
 * 
 * @param tracks - Array of tracks to add to cache
 */
export function warmCache(tracks: CachedAudioTrack[]): void {
  const now = Date.now();
  for (const track of tracks) {
    if (track.id) {
      cache.set(track.id, { track, cachedAt: now });
    }
  }
}

