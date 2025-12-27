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
  // Additional fields to prevent duplicate queries from UserDashboard
  auto_hide_tab_navigation: boolean | null;
  channel_view_mode: string | null;
};

type ImageSetBasic = {
  id: string;
  name?: string;
  set_type?: string;
};

type ImageSetDetails = {
  id: string;
  name: string;
  set_type: string;
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
  // Cache for image_sets by ID (prevents 4x duplicate calls for slideshow set details)
  imageSetsById: new Map<string, CacheEntry<ImageSetDetails | null>>(),
};

// In-flight promises (to deduplicate concurrent requests)
const inFlight = {
  audioChannels: null as Promise<AudioChannel[]> | null,
  systemPreferences: null as Promise<SystemPreferences | null> | null,
  activeChannelImageSet: null as Promise<ImageSetBasic | null> | null,
  userProfiles: new Map<string, Promise<UserProfile | null>>(),
  userPreferences: new Map<string, Promise<UserPreferencesData | null>>(),
  imageSetsById: new Map<string, Promise<ImageSetDetails | null>>(),
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
 * @param forceRefresh - If true, bypasses cache and fetches fresh data (default: false)
 */
export async function getAudioChannels(forceRefresh = false): Promise<AudioChannel[]> {
  // Return cached data if available (unless forceRefresh)
  if (!forceRefresh && cache.audioChannels) {
    return cache.audioChannels.data;
  }

  // If forceRefresh, clear any existing cache entry
  if (forceRefresh) {
    cache.audioChannels = null;
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
 * Get a single audio channel by ID (uses cached channel list)
 * This avoids per-ID Supabase queries by leveraging the full channel list cache.
 * If channels aren't cached yet, fetches all channels first (one request), then returns the matching one.
 * @param channelId - The channel ID to look up
 * @param forceRefresh - If true, refreshes the full channel list first (default: false)
 */
export async function getChannelById(channelId: string, forceRefresh = false): Promise<AudioChannel | null> {
  // If we have cached channels, find the one we need
  if (!forceRefresh && cache.audioChannels) {
    return cache.audioChannels.data.find(ch => ch.id === channelId) || null;
  }

  // Otherwise, fetch all channels (this populates the cache)
  const channels = await getAudioChannels(forceRefresh);
  return channels.find(ch => ch.id === channelId) || null;
}

/**
 * Get system preferences (cached)
 * Fetches from system_preferences table where id = 1
 * @param forceRefresh - If true, bypasses cache and fetches fresh data (default: false)
 */
export async function getSystemPreferences(forceRefresh = false): Promise<SystemPreferences | null> {
  // Return cached data if available (unless forceRefresh)
  if (!forceRefresh && cache.systemPreferences) {
    return cache.systemPreferences.data;
  }

  // If forceRefresh, clear any existing cache entry
  if (forceRefresh) {
    cache.systemPreferences = null;
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
 * @param forceRefresh - If true, bypasses cache and fetches fresh data (default: false)
 */
export async function getActiveChannelImageSet(forceRefresh = false): Promise<ImageSetBasic | null> {
  // Return cached data if available (unless forceRefresh)
  if (!forceRefresh && cache.activeChannelImageSet) {
    return cache.activeChannelImageSet.data;
  }

  // If forceRefresh, clear any existing cache entry
  if (forceRefresh) {
    cache.activeChannelImageSet = null;
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
 * Get image set by ID (cached)
 * Per-ID cache with in-flight deduplication.
 * Used to prevent duplicate calls for slideshow set details.
 * @param imageSetId - The image set ID to fetch
 * @param forceRefresh - If true, bypasses cache and fetches fresh data (default: false)
 */
export async function getImageSetById(imageSetId: string, forceRefresh = false): Promise<ImageSetDetails | null> {
  // Return cached data if available (unless forceRefresh)
  const cached = cache.imageSetsById.get(imageSetId);
  if (!forceRefresh && cached) {
    return cached.data;
  }

  // If forceRefresh, clear any existing cache entry
  if (forceRefresh) {
    cache.imageSetsById.delete(imageSetId);
  }

  // Return in-flight promise if request is already pending
  const pending = inFlight.imageSetsById.get(imageSetId);
  if (pending) {
    return pending;
  }

  // Create new request
  const promise = (async () => {
    if (import.meta.env.DEV) {
      fetchCounts.image_sets++;
    }

    const { data, error } = await supabase
      .from('image_sets')
      .select('id, name, set_type')
      .eq('id', imageSetId)
      .maybeSingle();

    if (error) {
      console.error('[CACHE] Error fetching image_set by ID:', error);
      throw error;
    }

    cache.imageSetsById.set(imageSetId, { data: data as ImageSetDetails | null, fetchedAt: Date.now() });
    inFlight.imageSetsById.delete(imageSetId);
    return data as ImageSetDetails | null;
  })();

  inFlight.imageSetsById.set(imageSetId, promise);
  return promise;
}

/**
 * Get user profile by user ID (cached)
 * Per-user cache with in-flight deduplication.
 * @param userId - The user ID to fetch profile for
 * @param forceRefresh - If true, bypasses cache and fetches fresh data (default: false)
 */
export async function getUserProfile(userId: string, forceRefresh = false): Promise<UserProfile | null> {
  // Return cached data if available (unless forceRefresh)
  const cached = cache.userProfiles.get(userId);
  if (!forceRefresh && cached) {
    return cached.data;
  }

  // If forceRefresh, clear any existing cache entry for this user
  if (forceRefresh) {
    cache.userProfiles.delete(userId);
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
 * Fetches all fields needed for startup to prevent duplicate queries from UserDashboard.
 * Fields: last_channel_id, channel_energy_levels, last_energy_level, session_count,
 *         auto_hide_tab_navigation, channel_view_mode
 * @param userId - The user ID to fetch preferences for
 * @param forceRefresh - If true, bypasses cache and fetches fresh data (default: false)
 */
export async function getUserPreferences(userId: string, forceRefresh = false): Promise<UserPreferencesData | null> {
  // Return cached data if available (unless forceRefresh)
  const cached = cache.userPreferences.get(userId);
  if (!forceRefresh && cached) {
    return cached.data;
  }

  // If forceRefresh, clear any existing cache entry for this user
  if (forceRefresh) {
    cache.userPreferences.delete(userId);
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
      .select('last_channel_id, channel_energy_levels, last_energy_level, session_count, auto_hide_tab_navigation, channel_view_mode')
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
  cache.imageSetsById.clear();
}

/**
 * Invalidate image set cache for a specific ID
 */
export function invalidateImageSetById(imageSetId: string): void {
  cache.imageSetsById.delete(imageSetId);
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

