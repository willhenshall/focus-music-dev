/**
 * Tests for supabaseDataCache
 * 
 * Verifies the in-memory cache + in-flight deduplication behavior.
 * These tests use mocked Supabase to verify:
 * - Repeated calls return same cached value without new fetch
 * - After resolution, repeated calls return cached value without new fetch
 * - Functions do not throw if called multiple times in parallel
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create a proper mock chain builder
const createMockChain = (resolvedData: any, resolvedError: any = null) => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const single = vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError });
  const order = vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError });
  const eq = vi.fn().mockReturnValue({ 
    maybeSingle, 
    single,
    order: vi.fn().mockReturnValue({ limit, maybeSingle }) 
  });
  const select = vi.fn().mockReturnValue({ order, eq });
  
  return { from: vi.fn().mockReturnValue({ select }) };
};

// Track fetch calls
let fetchCallCounts = {
  audio_channels: 0,
  system_preferences: 0,
  image_sets: 0,
  user_profiles: 0,
  user_preferences: 0,
};

// Mock data store
let mockData: Record<string, any> = {
  audio_channels: [],
  system_preferences: null,
  image_sets: null,
  user_profiles: {},
  user_preferences: {},
};

// Mock supabase
vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockImplementation(() => {
            fetchCallCounts.audio_channels++;
            return Promise.resolve({ data: mockData.audio_channels, error: null });
          }),
          eq: vi.fn().mockImplementation((field: string, value: any) => {
            return {
              maybeSingle: vi.fn().mockImplementation(() => {
                if (table === 'system_preferences') {
                  fetchCallCounts.system_preferences++;
                  return Promise.resolve({ data: mockData.system_preferences, error: null });
                }
                if (table === 'image_sets') {
                  fetchCallCounts.image_sets++;
                  return Promise.resolve({ data: mockData.image_sets, error: null });
                }
                if (table === 'user_profiles') {
                  fetchCallCounts.user_profiles++;
                  return Promise.resolve({ data: mockData.user_profiles[value], error: null });
                }
                if (table === 'user_preferences') {
                  fetchCallCounts.user_preferences++;
                  return Promise.resolve({ data: mockData.user_preferences[value], error: null });
                }
                return Promise.resolve({ data: null, error: null });
              }),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockImplementation(() => {
                  if (table === 'image_sets') {
                    fetchCallCounts.image_sets++;
                    return Promise.resolve({ data: mockData.image_sets, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                }),
              }),
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
        }),
      };
    }),
  },
}));

// Import after mocking
import {
  getAudioChannels,
  getSystemPreferences,
  getActiveChannelImageSet,
  getUserPreferences,
  getUserProfile,
  invalidateAudioChannels,
  invalidateSystemPreferences,
  invalidateActiveChannelImageSet,
  invalidateUserPreferences,
  invalidateUserProfile,
  clearAllCaches,
  getDebugFetchCounts,
  resetDebugFetchCounts,
} from '../supabaseDataCache';

describe('supabaseDataCache', () => {
  beforeEach(() => {
    // Clear all caches before each test
    clearAllCaches();
    resetDebugFetchCounts();
    
    // Reset mock data
    mockData = {
      audio_channels: [],
      system_preferences: null,
      image_sets: null,
      user_profiles: {},
      user_preferences: {},
    };
    
    // Reset fetch counts
    fetchCallCounts = {
      audio_channels: 0,
      system_preferences: 0,
      image_sets: 0,
      user_profiles: 0,
      user_preferences: 0,
    };
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAudioChannels', () => {
    it('returns cached data on second call without new fetch', async () => {
      mockData.audio_channels = [
        { id: '1', channel_name: 'Channel 1', display_order: 1 },
        { id: '2', channel_name: 'Channel 2', display_order: 2 },
      ];

      // First call - should hit Supabase
      const result1 = await getAudioChannels();
      expect(result1).toEqual(mockData.audio_channels);
      const fetchCount1 = getDebugFetchCounts().audio_channels;
      expect(fetchCount1).toBe(1);

      // Second call - should return cached data
      const result2 = await getAudioChannels();
      expect(result2).toEqual(mockData.audio_channels);
      expect(getDebugFetchCounts().audio_channels).toBe(1); // Still 1, no new fetch
    });

    it('does not throw when called multiple times in parallel', async () => {
      mockData.audio_channels = [{ id: 'test' }];

      // Fire off many parallel requests
      const promises = Array(5).fill(null).map(() => getAudioChannels());

      // All should resolve without throwing
      const results = await Promise.all(promises);
      results.forEach(r => expect(r).toEqual([{ id: 'test' }]));

      // Only one fetch should have been made (first call triggers, rest get cached)
      expect(getDebugFetchCounts().audio_channels).toBe(1);
    });

    it('refetches after cache invalidation', async () => {
      mockData.audio_channels = [{ id: '1' }];

      // First call
      const result1 = await getAudioChannels();
      expect(result1).toEqual([{ id: '1' }]);
      expect(getDebugFetchCounts().audio_channels).toBe(1);

      // Invalidate cache
      invalidateAudioChannels();

      // Update mock data
      mockData.audio_channels = [{ id: '2' }];

      // Second call after invalidation
      const result2 = await getAudioChannels();
      expect(result2).toEqual([{ id: '2' }]);
      expect(getDebugFetchCounts().audio_channels).toBe(2);
    });
  });

  describe('getSystemPreferences', () => {
    it('returns cached data on second call without new fetch', async () => {
      mockData.system_preferences = { id: 1, show_audio_diagnostics: true };

      const result1 = await getSystemPreferences();
      expect(result1).toEqual(mockData.system_preferences);
      expect(getDebugFetchCounts().system_preferences).toBe(1);

      const result2 = await getSystemPreferences();
      expect(result2).toEqual(mockData.system_preferences);
      expect(getDebugFetchCounts().system_preferences).toBe(1);
    });

    it('refetches after cache invalidation', async () => {
      mockData.system_preferences = { id: 1, show_audio_diagnostics: false };

      const result1 = await getSystemPreferences();
      expect(result1?.show_audio_diagnostics).toBe(false);

      invalidateSystemPreferences();
      mockData.system_preferences = { id: 1, show_audio_diagnostics: true };

      const result2 = await getSystemPreferences();
      expect(result2?.show_audio_diagnostics).toBe(true);
      expect(getDebugFetchCounts().system_preferences).toBe(2);
    });
  });

  describe('getUserPreferences', () => {
    it('caches per user ID', async () => {
      mockData.user_preferences = {
        'user1': { last_channel_id: 'ch1', session_count: 5 },
        'user2': { last_channel_id: 'ch2', session_count: 10 },
      };

      // First user
      const result1 = await getUserPreferences('user1');
      expect(result1?.last_channel_id).toBe('ch1');

      // Second user (different ID, should fetch again)
      const result2 = await getUserPreferences('user2');
      expect(result2?.last_channel_id).toBe('ch2');

      // First user again (should return cached)
      const result3 = await getUserPreferences('user1');
      expect(result3?.last_channel_id).toBe('ch1');

      // Two fetches total (one per user)
      expect(getDebugFetchCounts().user_preferences).toBe(2);
    });

    it('refetches specific user after invalidation', async () => {
      mockData.user_preferences = {
        'user1': { last_channel_id: 'ch1', session_count: 5 },
      };

      await getUserPreferences('user1');
      invalidateUserPreferences('user1');

      mockData.user_preferences['user1'] = { last_channel_id: 'ch1', session_count: 6 };

      const result = await getUserPreferences('user1');
      expect(result?.session_count).toBe(6);
      expect(getDebugFetchCounts().user_preferences).toBe(2);
    });
  });

  describe('getUserProfile', () => {
    it('caches per user ID', async () => {
      mockData.user_profiles = {
        'user1': { id: 'user1', display_name: 'User 1' },
        'user2': { id: 'user2', display_name: 'User 2' },
      };

      const result1 = await getUserProfile('user1');
      expect(result1?.display_name).toBe('User 1');

      const result2 = await getUserProfile('user2');
      expect(result2?.display_name).toBe('User 2');

      // Cached calls
      const result3 = await getUserProfile('user1');
      const result4 = await getUserProfile('user2');
      expect(result3?.display_name).toBe('User 1');
      expect(result4?.display_name).toBe('User 2');

      expect(getDebugFetchCounts().user_profiles).toBe(2);
    });

    it('refetches specific user after invalidation', async () => {
      mockData.user_profiles = {
        'user1': { id: 'user1', display_name: 'Old Name' },
      };

      await getUserProfile('user1');
      invalidateUserProfile('user1');

      mockData.user_profiles['user1'] = { id: 'user1', display_name: 'New Name' };

      const result = await getUserProfile('user1');
      expect(result?.display_name).toBe('New Name');
      expect(getDebugFetchCounts().user_profiles).toBe(2);
    });
  });

  describe('clearAllCaches', () => {
    it('clears all cached data', async () => {
      mockData.audio_channels = [{ id: '1' }];
      mockData.system_preferences = { id: 1 };

      // Populate caches
      await getAudioChannels();
      await getSystemPreferences();

      expect(getDebugFetchCounts().audio_channels).toBe(1);
      expect(getDebugFetchCounts().system_preferences).toBe(1);

      // Clear all
      clearAllCaches();

      // Update mock data
      mockData.audio_channels = [{ id: '2' }];
      mockData.system_preferences = { id: 2 };

      // These should fetch fresh data
      await getAudioChannels();
      await getSystemPreferences();

      expect(getDebugFetchCounts().audio_channels).toBe(2);
      expect(getDebugFetchCounts().system_preferences).toBe(2);
    });
  });

  describe('debug counters', () => {
    it('tracks fetch counts correctly', async () => {
      mockData.audio_channels = [{ id: '1' }];
      mockData.system_preferences = { id: 1 };
      mockData.user_profiles = { 'u1': { id: 'u1' } };
      mockData.user_preferences = { 'u1': { session_count: 1 } };

      const counts0 = getDebugFetchCounts();
      expect(counts0.audio_channels).toBe(0);
      expect(counts0.system_preferences).toBe(0);
      expect(counts0.user_profiles).toBe(0);
      expect(counts0.user_preferences).toBe(0);

      await getAudioChannels();
      await getSystemPreferences();
      await getUserProfile('u1');
      await getUserPreferences('u1');

      const counts1 = getDebugFetchCounts();
      expect(counts1.audio_channels).toBe(1);
      expect(counts1.system_preferences).toBe(1);
      expect(counts1.user_profiles).toBe(1);
      expect(counts1.user_preferences).toBe(1);

      // Cached calls should not increment
      await getAudioChannels();
      await getSystemPreferences();
      await getUserProfile('u1');
      await getUserPreferences('u1');

      const counts2 = getDebugFetchCounts();
      expect(counts2.audio_channels).toBe(1);
      expect(counts2.system_preferences).toBe(1);
      expect(counts2.user_profiles).toBe(1);
      expect(counts2.user_preferences).toBe(1);

      // Reset should clear counts
      resetDebugFetchCounts();
      const counts3 = getDebugFetchCounts();
      expect(counts3.audio_channels).toBe(0);
      expect(counts3.system_preferences).toBe(0);
    });
  });
});
