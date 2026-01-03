/**
 * Slot Config Cache - In-memory cache for slot sequencer configuration data
 * 
 * [PHASE 4.4] Reduces repeated slot table fetches during playback by:
 * 1. Caching slot_strategies, slot_definitions, slot_rule_groups, and slot_boosts
 * 2. Using TTL (5 minutes) to prevent stale data
 * 3. Batching all slot config fetches into parallel requests
 * 
 * This module provides:
 * - getOrFetchSlotConfig(channelId, energyLevel, supabase): Fetches all slot config in one call
 * - clearSlotConfigCache(): Clears all cached slot config
 * - invalidateSlotConfig(channelId): Invalidates config for a specific channel
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SlotStrategy {
  id: string;
  channel_id: string;
  energy_tier: string;
  num_slots: number;
  global_filters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SlotDefinition {
  id: string;
  strategy_id: string;
  index: number;
  [key: string]: unknown;
}

export interface SlotRuleGroup {
  id: string;
  strategy_id: string;
  order: number;
  rules?: SlotRule[];
  [key: string]: unknown;
}

export interface SlotRule {
  id: string;
  [key: string]: unknown;
}

export interface SlotBoost {
  id: string;
  slot_definition_id: string;
  [key: string]: unknown;
}

export interface CachedSlotConfig {
  strategy: SlotStrategy & {
    definitions: SlotDefinition[];
    boosts: SlotBoost[];
  };
  ruleGroups: SlotRuleGroup[];
  timestamp: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Cache TTL in milliseconds (5 minutes).
 * Matches the TTL used in audioTracksCache for consistency.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Maximum cache size to prevent memory bloat.
 * Keyed by `${channelId}:${energyLevel}`, so this limits unique channel+energy combinations.
 */
const MAX_CACHE_SIZE = 50;

// ============================================================================
// STATE
// ============================================================================

interface CacheEntry {
  config: CachedSlotConfig;
  cachedAt: number;
}

/**
 * In-memory cache keyed by `${channelId}:${energyLevel}`.
 */
const cache = new Map<string, CacheEntry>();

/**
 * In-flight requests to prevent duplicate fetches for the same config.
 */
const inFlightRequests = new Map<string, Promise<CachedSlotConfig | null>>();

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Generate cache key from channelId and energyLevel.
 */
function getCacheKey(channelId: string, energyLevel: string): string {
  return `${channelId}:${energyLevel}`;
}

/**
 * Check if a cache entry is still valid (not expired).
 */
function isEntryValid(entry: CacheEntry, now: number): boolean {
  return (now - entry.cachedAt) < CACHE_TTL_MS;
}

/**
 * Enforce max cache size using LRU eviction.
 */
function enforceCacheLimit(): void {
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, cache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      cache.delete(key);
    }
  }
}

// ============================================================================
// CORE API
// ============================================================================

/**
 * Get cached slot config or return null if not cached/expired.
 * 
 * @param channelId - Channel UUID
 * @param energyLevel - Energy level (low/medium/high)
 * @returns Cached config or null
 */
export function getSlotConfig(
  channelId: string, 
  energyLevel: string
): CachedSlotConfig | null {
  const key = getCacheKey(channelId, energyLevel);
  const entry = cache.get(key);
  const now = Date.now();
  
  if (entry && isEntryValid(entry, now)) {
    return entry.config;
  }
  
  // Remove stale entry if exists
  if (entry) {
    cache.delete(key);
  }
  
  return null;
}

/**
 * Fetch slot config from Supabase and cache it.
 * Uses parallel requests for efficiency.
 * 
 * @param channelId - Channel UUID
 * @param energyLevel - Energy level (low/medium/high)
 * @param supabase - Supabase client instance
 * @returns Fetched config or null if not found
 */
export async function fetchSlotConfig(
  channelId: string,
  energyLevel: string,
  supabase: { from: (table: string) => unknown }
): Promise<CachedSlotConfig | null> {
  const key = getCacheKey(channelId, energyLevel);
  
  // Check for in-flight request
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing;
  }
  
  // Create fetch promise
  const fetchPromise = (async () => {
    try {
      // Step 1: Fetch strategy first (needed for strategy_id)
      const { data: strategy, error: strategyError } = await (supabase as any)
        .from('slot_strategies')
        .select('*')
        .eq('channel_id', channelId)
        .eq('energy_tier', energyLevel)
        .maybeSingle();

      if (strategyError || !strategy) {
        return null;
      }

      // Step 2: Fetch definitions and rule groups in parallel
      const [definitionsResult, ruleGroupsResult] = await Promise.all([
        (supabase as any)
          .from('slot_definitions')
          .select('*')
          .eq('strategy_id', strategy.id)
          .order('index'),

        (supabase as any)
          .from('slot_rule_groups')
          .select(`
            *,
            rules:slot_rules(*)
          `)
          .eq('strategy_id', strategy.id)
          .order('order')
      ]);

      // Step 3: Fetch boosts for all definitions
      const definitionIds = definitionsResult.data?.map((d: SlotDefinition) => d.id) || [];
      let boosts: SlotBoost[] = [];
      
      if (definitionIds.length > 0) {
        const { data: boostsData } = await (supabase as any)
          .from('slot_boosts')
          .select('*')
          .in('slot_definition_id', definitionIds);
        boosts = boostsData || [];
      }

      const config: CachedSlotConfig = {
        strategy: {
          ...strategy,
          definitions: definitionsResult.data || [],
          boosts: boosts,
        },
        ruleGroups: ruleGroupsResult.data || [],
        timestamp: Date.now(),
      };

      // Cache the result
      const now = Date.now();
      cache.set(key, { config, cachedAt: now });
      enforceCacheLimit();

      return config;
    } catch (error) {
      console.error('[SLOT_CONFIG_CACHE] Fetch error:', error);
      return null;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}

/**
 * Get slot config from cache or fetch if missing/expired.
 * Convenience method that combines getSlotConfig + fetchSlotConfig.
 * 
 * @param channelId - Channel UUID
 * @param energyLevel - Energy level (low/medium/high)
 * @param supabase - Supabase client instance
 * @returns Config or null if not found
 */
export async function getOrFetchSlotConfig(
  channelId: string,
  energyLevel: string,
  supabase: { from: (table: string) => unknown }
): Promise<CachedSlotConfig | null> {
  // Check cache first
  const cached = getSlotConfig(channelId, energyLevel);
  if (cached) {
    return cached;
  }
  
  // Fetch and cache
  return fetchSlotConfig(channelId, energyLevel, supabase);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all cached slot config.
 */
export function clearSlotConfigCache(): void {
  cache.clear();
  inFlightRequests.clear();
}

/**
 * Invalidate slot config for a specific channel.
 * Removes all energy level variants for that channel.
 * 
 * @param channelId - Channel UUID to invalidate
 */
export function invalidateSlotConfig(channelId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${channelId}:`)) {
      cache.delete(key);
    }
  }
  for (const key of inFlightRequests.keys()) {
    if (key.startsWith(`${channelId}:`)) {
      inFlightRequests.delete(key);
    }
  }
}

/**
 * Invalidate slot config for a specific channel + energy level.
 * 
 * @param channelId - Channel UUID
 * @param energyLevel - Energy level
 */
export function invalidateSlotConfigByKey(channelId: string, energyLevel: string): void {
  const key = getCacheKey(channelId, energyLevel);
  cache.delete(key);
  inFlightRequests.delete(key);
}

/**
 * Get cache statistics for debugging.
 */
export function getSlotConfigCacheStats(): { 
  size: number; 
  inFlight: number;
  keys: string[];
} {
  return {
    size: cache.size,
    inFlight: inFlightRequests.size,
    keys: Array.from(cache.keys()),
  };
}

/**
 * Pre-populate cache with config (useful after bulk fetches).
 * 
 * @param channelId - Channel UUID
 * @param energyLevel - Energy level
 * @param config - Config to cache
 */
export function warmSlotConfigCache(
  channelId: string, 
  energyLevel: string, 
  config: CachedSlotConfig
): void {
  const key = getCacheKey(channelId, energyLevel);
  cache.set(key, { config, cachedAt: Date.now() });
  enforceCacheLimit();
}

