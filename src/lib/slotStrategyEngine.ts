/**
 * Slot-Based Playlist Strategy Engine
 *
 * Selects tracks based on configurable slots with target metadata values,
 * weighted field matching, and rule-based filtering.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type EnergyTier = 'low' | 'medium' | 'high';

export type SlotField = 'speed' | 'intensity' | 'brightness' | 'complexity' | 'valence' | 'arousal' | 'bpm' | 'key' | 'proximity';

export type RuleOperator = 'eq' | 'neq' | 'in' | 'nin' | 'gte' | 'lte' | 'between' | 'exists';

export interface SlotTargets {
  speed?: number;
  intensity?: number;
  brightness?: number;
  complexity?: number;
  valence?: number; // -1..1
  arousal?: number; // 0..1
  bpm?: number;
  key?: string | null;
  proximity?: number | null;
}

export interface SlotStrategy {
  id: string;
  channelId: string;
  energyTier: EnergyTier;
  name: string;
  numSlots: number;
  recentRepeatWindow: number;
}

export interface SlotDefinition {
  id: string;
  strategyId: string;
  index: number;
  targets: SlotTargets;
}

export interface SlotBoost {
  id: string;
  strategyId: string;
  field: SlotField;
  mode: 'near' | 'exact';
  weight: number; // 1-5
}

export interface SlotRule {
  id: string;
  groupId: string;
  field: string;
  operator: RuleOperator;
  value: any;
}

export interface SlotRuleGroup {
  id: string;
  strategyId: string;
  logic: 'AND' | 'OR';
  order: number;
  rules: SlotRule[];
}

export interface TrackCandidate {
  id: string;
  trackId: string;
  metadata: Record<string, any>;
  score: number;
  distances: Record<string, number>;
}

export interface SelectionResult {
  id: string; // Database UUID
  trackId: string; // Metadata track_id
  score: number;
  reasons: string[];
  candidates: TrackCandidate[];
}

/**
 * Field normalization ranges and defaults
 * @internal Exported for testing
 */
export const FIELD_RANGES: Record<SlotField, { min: number; max: number; tolerance: number }> = {
  speed: { min: 0, max: 5, tolerance: 0.5 },
  intensity: { min: 0, max: 5, tolerance: 0.5 },
  brightness: { min: 0, max: 5, tolerance: 0.5 },
  complexity: { min: 0, max: 5, tolerance: 0.5 },
  valence: { min: -1, max: 1, tolerance: 0.1 },
  arousal: { min: 0, max: 1, tolerance: 0.1 },
  bpm: { min: 60, max: 180, tolerance: 5 },
  key: { min: 0, max: 11, tolerance: 1 }, // Chromatic circle
  proximity: { min: 0, max: 5, tolerance: 0.5 },
};

/**
 * Normalize a field value to [0, 1] range
 * @internal Exported for testing
 */
export function normalizeField(field: SlotField, value: number | null | undefined): number {
  if (value === null || value === undefined) return 0.5; // Middle value for missing data

  const range = FIELD_RANGES[field];
  const normalized = (value - range.min) / (range.max - range.min);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Calculate distance between two values in normalized space
 * @internal Exported for testing
 */
export function calculateDistance(
  field: SlotField,
  target: number | string | null | undefined,
  value: number | string | null | undefined,
  mode: 'near' | 'exact'
): number {
  if (target === null || target === undefined || value === null || value === undefined) {
    return 1; // Maximum distance for missing data
  }

  if (mode === 'exact') {
    return target === value ? 0 : 1;
  }

  // For 'near' mode
  if (field === 'key' && typeof target === 'string' && typeof value === 'string') {
    // Chromatic circle distance for musical keys
    const keyMap: Record<string, number> = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    };
    const t = keyMap[target] ?? 0;
    const v = keyMap[value] ?? 0;
    const directDistance = Math.abs(t - v);
    const wrapDistance = 12 - directDistance;
    const minDistance = Math.min(directDistance, wrapDistance);
    return minDistance / 6; // Normalize to [0, 1]
  }

  // Numeric distance
  const normTarget = typeof target === 'number' ? normalizeField(field, target) : 0.5;
  const normValue = typeof value === 'number' ? normalizeField(field, value) : 0.5;
  return Math.abs(normTarget - normValue);
}

/**
 * Evaluate a single rule against track metadata
 * @internal Exported for testing
 */
export function evaluateRule(rule: SlotRule, metadata: Record<string, any>): boolean {
  // Handle both direct field names and SQL-style field expressions
  let fieldValue: any;

  if (rule.field.includes("metadata->>")) {
    // Extract field name from SQL expression like "metadata->>'genre'"
    const match = rule.field.match(/metadata->>'([^']+)'/);
    if (match) {
      fieldValue = metadata[match[1]];
    } else {
      fieldValue = metadata[rule.field];
    }
  } else {
    fieldValue = metadata[rule.field];
  }

  switch (rule.operator) {
    case 'eq':
      return fieldValue === rule.value;
    case 'neq':
      return fieldValue !== rule.value;
    case 'in':
      return Array.isArray(rule.value) && rule.value.includes(fieldValue);
    case 'nin':
      return Array.isArray(rule.value) && !rule.value.includes(fieldValue);
    case 'gte':
      return fieldValue >= rule.value;
    case 'lte':
      return fieldValue <= rule.value;
    case 'between':
      return Array.isArray(rule.value) &&
             fieldValue >= rule.value[0] &&
             fieldValue <= rule.value[1];
    case 'exists':
      return rule.value ? (fieldValue !== null && fieldValue !== undefined) :
                          (fieldValue === null || fieldValue === undefined);
    default:
      return true;
  }
}

/**
 * Evaluate rule groups against track metadata
 * @internal Exported for testing
 */
export function evaluateRuleGroups(groups: SlotRuleGroup[], metadata: Record<string, any>): boolean {
  if (groups.length === 0) return true;

  // Evaluate each group
  const groupResults = groups.map(group => {
    if (group.rules.length === 0) return true;

    if (group.logic === 'AND') {
      return group.rules.every(rule => evaluateRule(rule, metadata));
    } else {
      return group.rules.some(rule => evaluateRule(rule, metadata));
    }
  });

  // All groups must pass (implicit AND between groups)
  return groupResults.every(result => result);
}

/**
 * Score a track candidate against slot targets with weighted boosts
 * @internal Exported for testing
 */
export function scoreTrack(
  targets: SlotTargets,
  boosts: SlotBoost[],
  metadata: Record<string, any>
): { score: number; distances: Record<string, number> } {
  let totalScore = 0;
  let totalWeight = 0;
  const distances: Record<string, number> = {};

  for (const boost of boosts) {
    const target = targets[boost.field];
    const value = metadata[boost.field];

    if (target === undefined) {
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    const distance = calculateDistance(boost.field, target, value, boost.mode);
    distances[boost.field] = distance;

    // Convert distance to match score (closer = higher score)
    const matchScore = 1 - distance;
    totalScore += boost.weight * matchScore;
    totalWeight += boost.weight;
  }

  // Normalize by total weight
  const finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;

  return { score: finalScore, distances };
}

/**
 * Select the next track for a given slot
 */
export async function selectNextTrack(
  supabase: SupabaseClient,
  params: {
    channelId: string;
    energyTier: EnergyTier;
    slotIndex: number;
    history: string[]; // Recent track IDs to avoid
    seed?: number;
  }
): Promise<SelectionResult | null> {
  const { channelId, energyTier, slotIndex, history } = params;


  // Load strategy configuration
  const { data: strategy, error: strategyError } = await supabase
    .from('slot_strategies')
    .select('*')
    .eq('channel_id', channelId)
    .eq('energy_tier', energyTier)
    .maybeSingle();

  if (strategyError || !strategy) {
    return null;
  }

  // Load slot definition
  const { data: slotDef, error: slotError } = await supabase
    .from('slot_definitions')
    .select('*')
    .eq('strategy_id', strategy.id)
    .eq('index', slotIndex)
    .maybeSingle();

  if (slotError || !slotDef) {
    return null;
  }


  // Load boosts for this specific slot
  const { data: boosts, error: boostsError } = await supabase
    .from('slot_boosts')
    .select('*')
    .eq('slot_definition_id', slotDef.id);

  if (boostsError) {
    return null;
  }

  // Use default boosts if none defined (matches Focus@Will system)
  const effectiveBoosts = boosts && boosts.length > 0 ? boosts : [
    { field: 'speed', mode: 'near', weight: 2 },
    { field: 'intensity', mode: 'near', weight: 4 },
    { field: 'brightness', mode: 'near', weight: 1 },
    { field: 'complexity', mode: 'near', weight: 1 },
    { field: 'valence', mode: 'near', weight: 1 },
    { field: 'arousal', mode: 'near', weight: 1 },
    { field: 'bpm', mode: 'near', weight: 1 },
  ];


  // Load rule groups and rules
  const { data: ruleGroups, error: groupsError } = await supabase
    .from('slot_rule_groups')
    .select(`
      *,
      rules:slot_rules(*)
    `)
    .eq('strategy_id', strategy.id)
    .order('order');

  if (groupsError) {
    return null;
  }

  // Build the tracks query with genre filtering from rules
  let tracksQuery = supabase
    .from('audio_tracks')
    .select('id, metadata, speed, intensity, brightness, complexity, arousal, valence, tempo')
    .is('deleted_at', null);

  // Apply genre filters from rule groups at the database level for efficiency
  // Look for genre equality rules to pre-filter tracks
  const genreRules = ruleGroups?.flatMap(group =>
    group.rules?.filter(rule =>
      rule.field === 'genre' &&
      rule.operator === 'eq'
    ) || []
  ) || [];

  if (genreRules.length > 0) {
    // Apply the first genre rule as a database filter
    const genreRule = genreRules[0];
    tracksQuery = tracksQuery.eq('genre', genreRule.value);
  }

  const { data: tracks, error: tracksError } = await tracksQuery;

  if (tracksError || !tracks) {
    return null;
  }


  // Filter and score candidates
  const candidates: TrackCandidate[] = [];
  const recentWindow = strategy.recent_repeat_window || 5;
  const recentTracks = history.slice(-recentWindow);

  let filteredByRules = 0;
  let filteredByRecent = 0;

  for (const track of tracks) {
    const trackId = track.metadata?.track_id || track.id;

    // Skip recently played tracks
    if (recentTracks.includes(trackId)) {
      filteredByRecent++;
      continue;
    }

    // Merge database columns into metadata for scoring
    const enrichedMetadata = {
      ...track.metadata,
      speed: track.speed,
      intensity: track.intensity,
      brightness: track.brightness,
      complexity: track.complexity,
      arousal: track.arousal,
      valence: track.valence,
      bpm: track.tempo,
    };

    // Apply rule filters
    if (!evaluateRuleGroups(ruleGroups as SlotRuleGroup[], enrichedMetadata)) {
      filteredByRules++;
      continue;
    }

    // Score the track
    const { score, distances } = scoreTrack(
      slotDef.targets as SlotTargets,
      effectiveBoosts as SlotBoost[],
      enrichedMetadata
    );

    candidates.push({
      id: track.id,
      trackId,
      metadata: enrichedMetadata,
      score,
      distances,
    });
  }

  // Sort by score (descending)
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return null;
  }

  // Select winner (top candidate, with optional seed-based tie-breaking)
  const winner = candidates[0];

  const reasons = [
    `Slot ${slotIndex} match score: ${winner.score.toFixed(3)}`,
    ...Object.entries(winner.distances).map(([field, dist]) =>
      `${field}: ${(1 - dist).toFixed(2)}`
    ),
  ];

  const result = {
    id: winner.id,
    trackId: winner.trackId,
    score: winner.score,
    reasons,
    candidates: candidates.slice(0, 5), // Top 5 for preview
  };

  return result;
}

/**
 * Optimized version that uses pre-loaded strategy data from cache
 * This reduces latency from ~5s to <500ms by eliminating multiple DB queries
 */
export async function selectNextTrackCached(
  supabase: SupabaseClient,
  params: {
    channelId: string;
    energyTier: EnergyTier;
    slotIndex: number;
    history: string[];
    cachedStrategy?: any; // Pre-loaded strategy data
  }
): Promise<SelectionResult | null> {
  const { channelId, energyTier, slotIndex, history, cachedStrategy } = params;

  // Use cached data if available, otherwise fall back to loading
  let strategy, slotDef, boosts, ruleGroups;

  if (cachedStrategy) {
    strategy = cachedStrategy.strategy;
    ruleGroups = cachedStrategy.ruleGroups;

    // Find the slot definition for this index
    slotDef = strategy.definitions?.find((d: any) => d.index === slotIndex);
    if (!slotDef) {
      return null;
    }

    // Get boosts for this slot
    boosts = strategy.boosts?.filter((b: any) => b.slot_definition_id === slotDef.id) || [];
  } else {
    // Fallback to original loading logic
    const result = await selectNextTrack(supabase, { channelId, energyTier, slotIndex, history });
    return result;
  }

  // Use default boosts if none defined
  const effectiveBoosts = boosts.length > 0 ? boosts : [
    { field: 'speed', mode: 'near', weight: 2 },
    { field: 'intensity', mode: 'near', weight: 4 },
    { field: 'brightness', mode: 'near', weight: 1 },
    { field: 'complexity', mode: 'near', weight: 1 },
    { field: 'valence', mode: 'near', weight: 1 },
    { field: 'arousal', mode: 'near', weight: 1 },
    { field: 'bpm', mode: 'near', weight: 1 },
  ];

  // Build tracks query with genre filtering - fetch ALL fields for rule evaluation
  let tracksQuery = supabase
    .from('audio_tracks')
    .select('id, metadata, speed, intensity, brightness, complexity, arousal, valence, tempo, duration_seconds, catalog, locked, track_user_genre_id, music_key_value, energy_set, energy_low, energy_medium, energy_high')
    .is('deleted_at', null);

  // Apply genre filters from rule groups (skip these in evaluateRuleGroups later)
  const genreRules = ruleGroups?.flatMap((group: any) =>
    group.rules?.filter((rule: any) =>
      rule.field === 'genre' &&
      rule.operator === 'eq'
    ) || []
  ) || [];

  if (genreRules.length > 0) {
    tracksQuery = tracksQuery.eq('genre', genreRules[0].value);
  }

  // Remove genre rules from ruleGroups since we already filtered by SQL
  const filteredRuleGroups = ruleGroups?.map((group: any) => ({
    ...group,
    rules: group.rules?.filter((rule: any) =>
      rule.field !== 'genre'
    ) || []
  })) || [];

  const { data: tracks, error: tracksError } = await tracksQuery;

  if (tracksError) {
    return null;
  }

  if (!tracks || tracks.length === 0) {
    return null;
  }

  // Filter and score candidates
  const candidates: TrackCandidate[] = [];
  const recentWindow = strategy.recent_repeat_window || 5;
  const recentTracks = history.slice(-recentWindow);

  let skippedRecent = 0;
  let failedRules = 0;
  let scored = 0;

  for (const track of tracks) {
    const trackId = track.metadata?.track_id || track.id;

    // Skip recently played tracks
    if (recentTracks.includes(trackId)) {
      skippedRecent++;
      continue;
    }

    // Merge ALL database columns into metadata for rule evaluation
    const enrichedMetadata = {
      ...track.metadata,
      // Core audio features
      speed: track.speed,
      intensity: track.intensity,
      brightness: track.brightness,
      complexity: track.complexity,
      arousal: track.arousal,
      valence: track.valence,
      tempo: track.tempo,
      bpm: track.tempo,
      // Additional fields for flexible rule creation
      duration_seconds: track.duration_seconds,
      catalog: track.catalog,
      locked: track.locked,
      track_user_genre_id: track.track_user_genre_id,
      music_key_value: track.music_key_value,
      energy_set: track.energy_set,
      track_id: track.track_id,
      energy_low: track.energy_low,
      energy_medium: track.energy_medium,
      energy_high: track.energy_high,
    };

    // Apply rule filters (using filtered rule groups without genre rules)
    if (!evaluateRuleGroups(filteredRuleGroups as SlotRuleGroup[], enrichedMetadata)) {
      failedRules++;
      continue;
    }

    // Score the track
    const { score, distances } = scoreTrack(
      slotDef.targets as SlotTargets,
      effectiveBoosts as SlotBoost[],
      enrichedMetadata
    );

    scored++;
    candidates.push({
      id: track.id,
      trackId,
      metadata: enrichedMetadata,
      score,
      distances,
    });
  }

  // Sort by score (descending)
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return null;
  }

  // Select winner
  const winner = candidates[0];

  const reasons = [
    `Slot ${slotIndex} match score: ${winner.score.toFixed(3)}`,
    ...Object.entries(winner.distances).map(([field, dist]) =>
      `${field}: ${(1 - dist).toFixed(2)}`
    ),
  ];

  return {
    id: winner.id,
    trackId: winner.trackId,
    score: winner.score,
    reasons,
    candidates: candidates.slice(0, 5),
  };
}

/**
 * Calculate the current slot index based on session play count
 */
export function getCurrentSlotIndex(sessionPlayCount: number, numSlots: number): number {
  return (sessionPlayCount % numSlots) + 1;
}
