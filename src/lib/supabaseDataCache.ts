/**
 * Supabase Data Cache - In-memory caching with in-flight request deduplication
 * 
 * This module ensures each resource is fetched at most ONCE per session.
 * Features:
 * - In-memory cache (cleared on page refresh)
 * - In-flight promise deduplication (parallel calls share same request)
 * - Dev-only fetch counters for debugging
 * - Explicit invalidation when needed
 */

import { supabase, AudioChannel, SystemPreferences, UserProfile } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

type UserPreferencesData = {
  last_channel_id: string | null;
  channel_energy_levels: Record<string, string> | null;
  last_energy_level: string | null;
  session_count: number | null;
};

type ImageSetBasic = {
  id: string;
  name?: string;
  set_type?: string;
};

// ============================================================================
// CACHE STORAGE
// ============================================================================

// In-memory caches (keyed by resource type)
const cache = {
  audioChannels: null as CacheEntry<AudioChannel[]> | null,
  systemPreferences: null as CacheEntry<SystemPreferences> | null,
  activeChannelImageSet: null as CacheEntry<ImageSetBasic | null> | null,
  userProfiles: new Map<string, CacheEntry<UserProfile>>(),
  userPreferences: new Map<string, CacheEntry<UserPreferencesData | null>>(),
};

// In-flight promises (to deduplicate concurrent requests)
const inFlight = {
  audioChannels: null as Promise<AudioChannel[]> | null,
  systemPreferences: null as Promise<SystemPreferences | null> | null,
  activeChannelImageSet: null as Promise<ImageSetBasic | null> | null,
  userProfiles: new Map<string, Promise<UserProfile | null>>(),
  userPreferences: new Map<string, Promise<UserPreferencesData | null>>(),
};

// ============================================================================
// DEV-ONLY DEBUG COUNTERS
// ============================================================================

type FetchCounts = {
  audio_channels: number;
  system_preferences: number;
  image_sets: number;
  user_profiles: number;
  user_preferences: number;
};

const fetchCounts: FetchCounts = {
  audio_channels: 0,
  system_preferences: 0,
  image_sets: 0,
  user_profiles: 0,
  user_preferences: 0,
};

// Expose debug counters in dev mode only
if (import.meta.env.DEV) {
  // Extend window type for debug object
  (window as unknown as { __playerDebug?: { startupFetchCounts: FetchCounts } }).__playerDebug = 
    (window as unknown as { __playerDebug?: { startupFetchCounts: FetchCounts } }).__playerDebug || {};
  (window as unknown as { __playerDebug: { startupFetchCounts: FetchCounts } }).__playerDebug.startupFetchCounts = fetchCounts;
}

// ============================================================================
// CACHED GETTERS
// ============================================================================

/**
 * Get all audio channels (cached)
 * Returns cached data if available, otherwise fetches from Supabase.
 * Concurrent calls share the same in-flight promise.
 */
export async function getAudioChannels(): Promise<AudioChannel[]> {
  // Return cached data if available
  if (cache.audioChannels) {
    return cache.audioChannels.data;
  }

  // Return in-flight promise if request is already pending
  if (inFlight.audioChannels) {
    return inFlight.audioChannels;
  }

  // Create new request
  inFlight.audioChannels = (async () => {
    if (import.meta.env.DEV) {
      fetchCounts.audio_channels++;
    }

    const { data, error } = await supabase
      .from('audio_channels')
      .select('*')
      .order('display_order');

    if (error) {
      console.error('[CACHE] Error fetching audio_channels:', error);
      throw error;
    }

    const channels = data || [];
    cache.audioChannels = { data: channels, fetchedAt: Date.now() };
    inFlight.audioChannels = null;
    return channels;
  })();

  return inFlight.audioChannels;
}

/**
 * Get system preferences (cached)
 * Fetches from system_preferences table where id = 1
 */
export async function getSystemPreferences(): Promise<SystemPreferences | null> {
  // Return cached data if available
  if (cache.systemPreferences) {
    return cache.systemPreferences.data;
  }

  // Return in-flight promise if request is already pending
  if (inFlight.systemPreferences) {
    return inFlight.systemPreferences;
  }

  // Create new request
  inFlight.systemPreferences = (async () => {
    if (import.meta.env.DEV) {
      fetchCounts.system_preferences++;
    }

    const { data, error } = await supabase
      .from('system_preferences')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('[CACHE] Error fetching system_preferences:', error);
      throw error;
    }

    cache.systemPreferences = { data: data as SystemPreferences, fetchedAt: Date.now() };
    inFlight.systemPreferences = null;
    return data as SystemPreferences | null;
  })();

  return inFlight.systemPreferences;
}

/**
 * Get active channel image set (cached)
 * Fetches from image_sets where set_type = 'channel' and is_active_channel_set = true
 */
export async function getActiveChannelImageSet(): Promise<ImageSetBasic | null> {
  // Return cached data if available
  if (cache.activeChannelImageSet) {
    return cache.activeChannelImageSet.data;
  }

  // Return in-flight promise if request is already pending
  if (inFlight.activeChannelImageSet) {
    return inFlight.activeChannelImageSet;
  }

  // Create new request
  inFlight.activeChannelImageSet = (async () => {
    if (import.meta.env.DEV) {
      fetchCounts.image_sets++;
    }

    const { data, error } = await supabase
      .from('image_sets')
      .select('id')
      .eq('set_type', 'channel')
      .eq('is_active_channel_set', true)
      .maybeSingle();

    if (error) {
      console.error('[CACHE] Error fetching active channel image set:', error);
      throw error;
    }

    cache.activeChannelImageSet = { data: data as ImageSetBasic | null, fetchedAt: Date.now() };
    inFlight.activeChannelImageSet = null;
    return data as ImageSetBasic | null;
  })();

  return inFlight.activeChannelImageSet;
}

/**
 * Get user profile by user ID (cached)
 * Per-user cache with in-flight deduplication.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  // Return cached data if available
  const cached = cache.userProfiles.get(userId);
  if (cached) {
    return cached.data;
  }

  // Return in-flight promise if request is already pending
  const pending = inFlight.userProfiles.get(userId);
  if (pending) {
    return pending;
  }

  // Create new request
  const promise = (async () => {
    if (import.meta.env.DEV) {
      fetchCounts.user_profiles++;
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[CACHE] Error fetching user_profile:', error);
      throw error;
    }

    if (data) {
      cache.userProfiles.set(userId, { data, fetchedAt: Date.now() });
    }
    inFlight.userProfiles.delete(userId);
    return data;
  })();

  inFlight.userProfiles.set(userId, promise);
  return promise;
}

/**
 * Get user preferences by user ID (cached)
 * Fetches minimal fields needed for startup: last_channel_id, channel_energy_levels, last_energy_level, session_count
 */
export async function getUserPreferences(userId: string): Promise<UserPreferencesData | null> {
  // Return cached data if available
  const cached = cache.userPreferences.get(userId);
  if (cached) {
    return cached.data;
  }

  // Return in-flight promise if request is already pending
  const pending = inFlight.userPreferences.get(userId);
  if (pending) {
    return pending;
  }

  // Create new request
  const promise = (async () => {
    if (import.meta.env.DEV) {
      fetchCounts.user_preferences++;
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('last_channel_id, channel_energy_levels, last_energy_level, session_count')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[CACHE] Error fetching user_preferences:', error);
      throw error;
    }

    cache.userPreferences.set(userId, { data, fetchedAt: Date.now() });
    inFlight.userPreferences.delete(userId);
    return data;
  })();

  inFlight.userPreferences.set(userId, promise);
  return promise;
}

// ============================================================================
// CACHE INVALIDATION
// ============================================================================

/**
 * Invalidate audio channels cache
 * Call this when channels are updated (e.g., via realtime subscription)
 */
export function invalidateAudioChannels(): void {
  cache.audioChannels = null;
}

/**
 * Invalidate system preferences cache
 * Call this when preferences are updated (e.g., via realtime subscription)
 */
export function invalidateSystemPreferences(): void {
  cache.systemPreferences = null;
}

/**
 * Invalidate active channel image set cache
 */
export function invalidateActiveChannelImageSet(): void {
  cache.activeChannelImageSet = null;
}

/**
 * Invalidate user profile cache for a specific user
 */
export function invalidateUserProfile(userId: string): void {
  cache.userProfiles.delete(userId);
}

/**
 * Invalidate user preferences cache for a specific user
 */
export function invalidateUserPreferences(userId: string): void {
  cache.userPreferences.delete(userId);
}

/**
 * Clear all caches (useful for logout)
 */
export function clearAllCaches(): void {
  cache.audioChannels = null;
  cache.systemPreferences = null;
  cache.activeChannelImageSet = null;
  cache.userProfiles.clear();
  cache.userPreferences.clear();
}

/**
 * Update audio channels cache directly (for realtime updates)
 * This allows updating the cache without making a new request.
 */
export function updateAudioChannelsCache(channels: AudioChannel[]): void {
  cache.audioChannels = { data: channels, fetchedAt: Date.now() };
}

/**
 * Update system preferences cache directly (for realtime updates)
 */
export function updateSystemPreferencesCache(prefs: SystemPreferences): void {
  cache.systemPreferences = { data: prefs, fetchedAt: Date.now() };
}

/**
 * Update user profile cache directly
 */
export function updateUserProfileCache(userId: string, profile: UserProfile): void {
  cache.userProfiles.set(userId, { data: profile, fetchedAt: Date.now() });
}

/**
 * Get a single channel by ID from cache (without network request)
 * Returns null if not in cache
 */
export function getChannelFromCache(channelId: string): AudioChannel | null {
  if (!cache.audioChannels) return null;
  return cache.audioChannels.data.find(ch => ch.id === channelId) || null;
}

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Get current fetch counts (dev-only)
 */
export function getDebugFetchCounts(): FetchCounts {
  return { ...fetchCounts };
}

/**
 * Reset fetch counts (useful for tests)
 */
export function resetDebugFetchCounts(): void {
  fetchCounts.audio_channels = 0;
  fetchCounts.system_preferences = 0;
  fetchCounts.image_sets = 0;
  fetchCounts.user_profiles = 0;
  fetchCounts.user_preferences = 0;
}

