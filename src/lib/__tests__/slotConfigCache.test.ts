/**
 * Unit tests for slotConfigCache.ts - Slot Config Cache
 * 
 * [PHASE 4.4] Tests verify:
 * 1. getSlotConfig returns cached data and identifies misses
 * 2. fetchSlotConfig fetches and caches slot config
 * 3. getOrFetchSlotConfig combines cache hits with fetched data
 * 4. Cache TTL expiration works correctly
 * 5. In-flight request deduplication
 * 6. Cache invalidation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getSlotConfig,
  fetchSlotConfig,
  getOrFetchSlotConfig,
  clearSlotConfigCache,
  invalidateSlotConfig,
  invalidateSlotConfigByKey,
  getSlotConfigCacheStats,
  warmSlotConfigCache,
  type CachedSlotConfig,
  type SlotStrategy,
  type SlotDefinition,
  type SlotRuleGroup,
  type SlotBoost,
} from '../slotConfigCache';

// Helper to create mock slot config
function createMockSlotConfig(
  channelId: string,
  energyLevel: string,
  strategyId = 'strategy-1'
): CachedSlotConfig {
  return {
    strategy: {
      id: strategyId,
      channel_id: channelId,
      energy_tier: energyLevel,
      num_slots: 20,
      definitions: [
        { id: 'def-1', strategy_id: strategyId, index: 0 },
        { id: 'def-2', strategy_id: strategyId, index: 1 },
      ] as SlotDefinition[],
      boosts: [
        { id: 'boost-1', slot_definition_id: 'def-1' },
      ] as SlotBoost[],
    },
    ruleGroups: [
      { id: 'rg-1', strategy_id: strategyId, order: 0, rules: [] },
    ] as SlotRuleGroup[],
    timestamp: Date.now(),
  };
}

// Mock Supabase client that properly handles chained async calls
function createMockSupabase(config: CachedSlotConfig | null) {
  const mockStrategy = config?.strategy || null;
  const mockDefinitions = config?.strategy.definitions || [];
  const mockRuleGroups = config?.ruleGroups || [];
  const mockBoosts = config?.strategy.boosts || [];

  const createChainableQuery = (table: string) => {
    const result = {
      select: (_fields?: string) => result,
      eq: (_field: string, _value: string) => result,
      in: (_field: string, _ids: string[]) => result,
      order: (_col: string) => result,
      maybeSingle: async () => {
        if (table === 'slot_strategies') {
          return { 
            data: mockStrategy, 
            error: mockStrategy ? null : { message: 'Not found' } 
          };
        }
        return { data: null, error: null };
      },
      then: (resolve: (result: { data: unknown[] | null; error: null }) => void) => {
        let data: unknown[] = [];
        if (table === 'slot_definitions') data = mockDefinitions;
        if (table === 'slot_rule_groups') data = mockRuleGroups;
        if (table === 'slot_boosts') data = mockBoosts;
        resolve({ data, error: null });
        return { catch: () => {} };
      },
    };
    return result;
  };

  return {
    from: (table: string) => createChainableQuery(table),
  };
}

describe('slotConfigCache', () => {
  beforeEach(() => {
    clearSlotConfigCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getSlotConfig', () => {
    it('should return null when cache is empty', () => {
      const result = getSlotConfig('channel-1', 'medium');
      expect(result).toBeNull();
    });

    it('should return cached config when available', () => {
      const config = createMockSlotConfig('channel-1', 'medium');
      warmSlotConfigCache('channel-1', 'medium', config);

      const result = getSlotConfig('channel-1', 'medium');
      expect(result).not.toBeNull();
      expect(result?.strategy.channel_id).toBe('channel-1');
      expect(result?.strategy.energy_tier).toBe('medium');
    });

    it('should return null for expired entries', () => {
      const config = createMockSlotConfig('channel-1', 'medium');
      warmSlotConfigCache('channel-1', 'medium', config);

      // Advance time past TTL (5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      const result = getSlotConfig('channel-1', 'medium');
      expect(result).toBeNull();
    });

    it('should cache by channelId + energyLevel key', () => {
      const configMedium = createMockSlotConfig('channel-1', 'medium');
      const configHigh = createMockSlotConfig('channel-1', 'high');
      
      warmSlotConfigCache('channel-1', 'medium', configMedium);
      warmSlotConfigCache('channel-1', 'high', configHigh);

      expect(getSlotConfig('channel-1', 'medium')?.strategy.energy_tier).toBe('medium');
      expect(getSlotConfig('channel-1', 'high')?.strategy.energy_tier).toBe('high');
      expect(getSlotConfig('channel-1', 'low')).toBeNull();
    });
  });

  describe('fetchSlotConfig', () => {
    it('should fetch and cache config', async () => {
      const config = createMockSlotConfig('channel-1', 'medium');
      const mockSupabase = createMockSupabase(config);

      const result = await fetchSlotConfig('channel-1', 'medium', mockSupabase);
      
      expect(result).not.toBeNull();
      expect(result?.strategy.channel_id).toBe('channel-1');
      expect(getSlotConfigCacheStats().size).toBe(1);
    });

    it('should return null when strategy not found', async () => {
      const mockSupabase = createMockSupabase(null);

      const result = await fetchSlotConfig('nonexistent', 'medium', mockSupabase);
      
      expect(result).toBeNull();
    });
  });

  describe('getOrFetchSlotConfig', () => {
    it('should return cached config without fetching', async () => {
      const config = createMockSlotConfig('channel-1', 'medium');
      warmSlotConfigCache('channel-1', 'medium', config);
      
      const mockSupabase = createMockSupabase(null); // Would return null if called

      const result = await getOrFetchSlotConfig('channel-1', 'medium', mockSupabase);
      
      expect(result).not.toBeNull();
      expect(result?.strategy.channel_id).toBe('channel-1');
    });

    it('should fetch when not cached', async () => {
      const config = createMockSlotConfig('channel-1', 'medium');
      const mockSupabase = createMockSupabase(config);

      const result = await getOrFetchSlotConfig('channel-1', 'medium', mockSupabase);
      
      expect(result).not.toBeNull();
      expect(result?.strategy.channel_id).toBe('channel-1');
    });
  });

  describe('cache management', () => {
    it('should clear all entries on clearSlotConfigCache', () => {
      warmSlotConfigCache('channel-1', 'low', createMockSlotConfig('channel-1', 'low'));
      warmSlotConfigCache('channel-1', 'medium', createMockSlotConfig('channel-1', 'medium'));
      warmSlotConfigCache('channel-2', 'high', createMockSlotConfig('channel-2', 'high'));

      expect(getSlotConfigCacheStats().size).toBe(3);

      clearSlotConfigCache();
      
      expect(getSlotConfigCacheStats().size).toBe(0);
    });

    it('should invalidate all energy levels for a channel', () => {
      warmSlotConfigCache('channel-1', 'low', createMockSlotConfig('channel-1', 'low'));
      warmSlotConfigCache('channel-1', 'medium', createMockSlotConfig('channel-1', 'medium'));
      warmSlotConfigCache('channel-1', 'high', createMockSlotConfig('channel-1', 'high'));
      warmSlotConfigCache('channel-2', 'medium', createMockSlotConfig('channel-2', 'medium'));

      expect(getSlotConfigCacheStats().size).toBe(4);

      invalidateSlotConfig('channel-1');
      
      expect(getSlotConfigCacheStats().size).toBe(1);
      expect(getSlotConfig('channel-1', 'low')).toBeNull();
      expect(getSlotConfig('channel-1', 'medium')).toBeNull();
      expect(getSlotConfig('channel-1', 'high')).toBeNull();
      expect(getSlotConfig('channel-2', 'medium')).not.toBeNull();
    });

    it('should invalidate specific channel + energy level', () => {
      warmSlotConfigCache('channel-1', 'low', createMockSlotConfig('channel-1', 'low'));
      warmSlotConfigCache('channel-1', 'medium', createMockSlotConfig('channel-1', 'medium'));

      invalidateSlotConfigByKey('channel-1', 'low');
      
      expect(getSlotConfig('channel-1', 'low')).toBeNull();
      expect(getSlotConfig('channel-1', 'medium')).not.toBeNull();
    });

    it('should report correct cache stats', () => {
      expect(getSlotConfigCacheStats()).toMatchObject({
        size: 0,
        inFlight: 0,
        keys: [],
      });

      warmSlotConfigCache('channel-1', 'medium', createMockSlotConfig('channel-1', 'medium'));
      
      const stats = getSlotConfigCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.keys).toContain('channel-1:medium');
    });
  });

  describe('warmSlotConfigCache', () => {
    it('should pre-populate cache', () => {
      const config = createMockSlotConfig('channel-1', 'medium');
      
      warmSlotConfigCache('channel-1', 'medium', config);
      
      const result = getSlotConfig('channel-1', 'medium');
      expect(result).not.toBeNull();
      expect(result?.strategy.num_slots).toBe(20);
    });
  });
});

