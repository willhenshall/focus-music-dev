/**
 * Player Performance Instrumentation - TTFA (Time To First Audible) Tracking
 * 
 * This module provides a structured API for measuring and proving "audio fast start"
 * improvements. It tracks the time from user action to first audible audio.
 * 
 * Usage:
 * - Call perfStart() when user initiates playback (channel switch, energy change, play)
 * - Call perfMark() at key points in the loading flow
 * - Call perfSuccess() when first audible audio is detected
 * - Call perfFail() if loading times out or fails
 * 
 * In dev mode, events are exposed via window.__playerPerf for debugging and E2E testing.
 * Console logs are formatted as single-line JSON for easy parsing.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Trigger types for TTFA measurement.
 */
export type TTFATriggerType = 'channel_change' | 'energy_change' | 'play' | 'resume';

/**
 * Audio source type (HLS or direct MP3).
 */
export type AudioType = 'hls' | 'mp3';

/**
 * Complete TTFA event with all timing marks.
 */
export interface TTFAEvent {
  // Required: set at perfStart
  requestId: string;
  triggerType: TTFATriggerType;
  clickAt: number;  // performance.now() timestamp

  // Optional: context info (set at perfStart or via marks)
  channelId?: string;
  channelName?: string;
  energyLevel?: string;

  // Optional: timing marks (set via perfMark)
  playlistReadyAt?: number;
  trackLoadStartAt?: number;
  sourceSelectedAt?: number;
  manifestParsedAt?: number;
  firstAudioAt?: number;

  // Optional: computed on success/fail
  ttfaMs?: number;
  audioType?: AudioType;
  success?: boolean;
  error?: string;

  // Optional: metadata added on completion
  trackId?: string;
  trackName?: string;
  artistName?: string;
  timestamp?: string;  // ISO string for when event completed
}

/**
 * Mark keys that can be set via perfMark.
 */
export type TTFAMarkKey = 
  | 'playlistReadyAt'
  | 'trackLoadStartAt'
  | 'sourceSelectedAt'
  | 'manifestParsedAt'
  | 'firstAudioAt';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Maximum number of events to keep in the ring buffer.
 * Older events are dropped when this limit is reached.
 */
const MAX_EVENTS = 200;

// ============================================================================
// STATE
// ============================================================================

/**
 * In-memory ring buffer of TTFA events.
 */
const events: TTFAEvent[] = [];

/**
 * Map of active (in-progress) events by requestId.
 */
const activeEvents = new Map<string, TTFAEvent>();

/**
 * Set of requestIds that have reached a terminal state (success or failure).
 * Once a requestId is in this set, no further mutations are allowed.
 * This prevents race conditions where timeout and success detection fire concurrently.
 */
const terminalEvents = new Set<string>();

// ============================================================================
// CORE API
// ============================================================================

/**
 * Start tracking a new TTFA event.
 * Call this when the user initiates playback (channel switch, energy change, play/resume).
 * 
 * @param payload - Initial event data (must include requestId and triggerType)
 */
export function perfStart(payload: Partial<TTFAEvent> & { requestId: string; triggerType: TTFATriggerType }): void {
  const event: TTFAEvent = {
    requestId: payload.requestId,
    triggerType: payload.triggerType,
    clickAt: payload.clickAt ?? performance.now(),
    channelId: payload.channelId,
    channelName: payload.channelName,
    energyLevel: payload.energyLevel,
  };

  // Store in active events map
  activeEvents.set(payload.requestId, event);

  // Log in dev mode
  if (import.meta.env.DEV) {
    console.log('[TTFA:START]', JSON.stringify({
      requestId: event.requestId,
      triggerType: event.triggerType,
      channelName: event.channelName,
      energyLevel: event.energyLevel,
    }));
  }
}

/**
 * Record a timing mark for an active TTFA event.
 * 
 * @param requestId - The requestId of the active event
 * @param mark - The mark key to set
 * @param value - Optional timestamp value (defaults to performance.now())
 */
export function perfMark(requestId: string, mark: TTFAMarkKey, value?: number): void {
  const event = activeEvents.get(requestId);
  if (!event) {
    // Silently ignore marks for unknown/completed events
    return;
  }

  event[mark] = value ?? performance.now();

  // Log in dev mode
  if (import.meta.env.DEV) {
    console.log('[TTFA:MARK]', JSON.stringify({
      requestId,
      mark,
      elapsedMs: Math.round(event[mark]! - event.clickAt),
    }));
  }
}

/**
 * Mark a TTFA event as successful.
 * Computes ttfaMs from clickAt to now (or firstAudioAt if provided).
 * 
 * Once an event is marked as success, it becomes terminal and cannot be
 * changed to failure. This prevents race conditions with timeout callbacks.
 * 
 * @param requestId - The requestId of the active event
 * @param payload - Optional additional data to merge into the event
 * @returns true if the event was successfully marked, false if already terminal or not found
 */
export function perfSuccess(requestId: string, payload?: Partial<TTFAEvent>): boolean {
  // Terminal guard: if already finalized, do nothing
  if (terminalEvents.has(requestId)) {
    if (import.meta.env.DEV) {
      console.log('[TTFA:GUARD] perfSuccess ignored - requestId already terminal:', requestId);
    }
    return false;
  }

  const event = activeEvents.get(requestId);
  if (!event) {
    return false;
  }

  // Mark as terminal FIRST (before any async or external calls could race)
  terminalEvents.add(requestId);

  // Mark completion time
  const now = performance.now();
  event.firstAudioAt = payload?.firstAudioAt ?? event.firstAudioAt ?? now;
  event.ttfaMs = Math.round(event.firstAudioAt - event.clickAt);
  event.success = true;
  event.timestamp = new Date().toISOString();

  // Merge any additional payload
  if (payload) {
    if (payload.audioType !== undefined) event.audioType = payload.audioType;
    if (payload.trackId !== undefined) event.trackId = payload.trackId;
    if (payload.trackName !== undefined) event.trackName = payload.trackName;
    if (payload.artistName !== undefined) event.artistName = payload.artistName;
    if (payload.channelId !== undefined) event.channelId = payload.channelId;
    if (payload.channelName !== undefined) event.channelName = payload.channelName;
    if (payload.energyLevel !== undefined) event.energyLevel = payload.energyLevel;
  }

  // Move to completed events ring buffer
  activeEvents.delete(requestId);
  addToRingBuffer(event);

  // Log the structured TTFA event (single line JSON for easy parsing)
  console.log('[TTFA]', JSON.stringify(event));
  
  return true;
}

/**
 * Mark a TTFA event as failed.
 * 
 * If the event has already been marked as success (terminal), this is a no-op.
 * This prevents race conditions where timeout callbacks fire after success.
 * 
 * @param requestId - The requestId of the active event
 * @param error - Error message describing the failure
 * @param payload - Optional additional data to merge into the event
 * @returns true if the event was marked as failed, false if already terminal or not found
 */
export function perfFail(requestId: string, error: string, payload?: Partial<TTFAEvent>): boolean {
  // Terminal guard: if already finalized, do nothing
  if (terminalEvents.has(requestId)) {
    if (import.meta.env.DEV) {
      console.log('[TTFA:GUARD] perfFail ignored - requestId already terminal:', requestId);
    }
    return false;
  }

  const event = activeEvents.get(requestId);
  if (!event) {
    return false;
  }

  // Mark as terminal FIRST (before any async or external calls could race)
  terminalEvents.add(requestId);

  // Mark failure
  const now = performance.now();
  event.ttfaMs = Math.round(now - event.clickAt);
  event.success = false;
  event.error = error;
  event.timestamp = new Date().toISOString();

  // Merge any additional payload
  if (payload) {
    if (payload.audioType !== undefined) event.audioType = payload.audioType;
    if (payload.trackId !== undefined) event.trackId = payload.trackId;
    if (payload.trackName !== undefined) event.trackName = payload.trackName;
    if (payload.artistName !== undefined) event.artistName = payload.artistName;
  }

  // Move to completed events ring buffer
  activeEvents.delete(requestId);
  addToRingBuffer(event);

  // Log the structured TTFA event (single line JSON for easy parsing)
  console.log('[TTFA]', JSON.stringify(event));
  
  return true;
}

/**
 * Get all completed TTFA events.
 */
export function getPerfEvents(): TTFAEvent[] {
  return [...events];
}

/**
 * Clear all completed TTFA events and terminal state tracking.
 */
export function clearPerfEvents(): void {
  events.length = 0;
  terminalEvents.clear();
}

/**
 * Check if a requestId has reached a terminal state (success or failure).
 * Once terminal, no further mutations are possible for that requestId.
 * 
 * @param requestId - The requestId to check
 * @returns true if the event is terminal, false otherwise
 */
export function isTerminal(requestId: string): boolean {
  return terminalEvents.has(requestId);
}

/**
 * Get the most recent completed event (if any).
 */
export function getLatestEvent(): TTFAEvent | undefined {
  return events[events.length - 1];
}

/**
 * Get an active (in-progress) event by requestId.
 */
export function getActiveEvent(requestId: string): TTFAEvent | undefined {
  return activeEvents.get(requestId);
}

// ============================================================================
// SUMMARY / ANALYSIS
// ============================================================================

/**
 * Summary statistics for TTFA events.
 */
export interface TTFASummary {
  count: number;
  successes: number;
  failures: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  byTriggerType: Record<string, { count: number; p50Ms: number }>;
  byAudioType: Record<string, { count: number; p50Ms: number }>;
}

/**
 * Compute summary statistics from completed events.
 */
export function getSummary(): TTFASummary {
  const successEvents = events.filter(e => e.success === true && typeof e.ttfaMs === 'number');
  const failureEvents = events.filter(e => e.success === false);

  const ttfaValues = successEvents.map(e => e.ttfaMs!).sort((a, b) => a - b);

  const summary: TTFASummary = {
    count: events.length,
    successes: successEvents.length,
    failures: failureEvents.length,
    successRate: events.length > 0 ? Math.round((successEvents.length / events.length) * 100) : 0,
    p50Ms: percentile(ttfaValues, 50),
    p95Ms: percentile(ttfaValues, 95),
    maxMs: ttfaValues.length > 0 ? ttfaValues[ttfaValues.length - 1] : 0,
    byTriggerType: {},
    byAudioType: {},
  };

  // Group by trigger type
  const triggerGroups = groupBy(successEvents, e => e.triggerType);
  for (const [triggerType, group] of Object.entries(triggerGroups)) {
    const values = group.map(e => e.ttfaMs!).sort((a, b) => a - b);
    summary.byTriggerType[triggerType] = {
      count: group.length,
      p50Ms: percentile(values, 50),
    };
  }

  // Group by audio type
  const audioGroups = groupBy(successEvents.filter(e => e.audioType), e => e.audioType!);
  for (const [audioType, group] of Object.entries(audioGroups)) {
    const values = group.map(e => e.ttfaMs!).sort((a, b) => a - b);
    summary.byAudioType[audioType] = {
      count: group.length,
      p50Ms: percentile(values, 50),
    };
  }

  return summary;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Add an event to the ring buffer, dropping oldest if at capacity.
 */
function addToRingBuffer(event: TTFAEvent): void {
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.shift();
  }
}

/**
 * Calculate percentile from sorted array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Group array items by a key function.
 */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

// ============================================================================
// DEV MODE EXPOSURE
// ============================================================================

/**
 * Expose playerPerf on window for dev/E2E access.
 */
if (typeof window !== 'undefined') {
  (window as any).__playerPerf = {
    events: getPerfEvents,
    clear: clearPerfEvents,
    dump: () => JSON.stringify(getPerfEvents(), null, 2),
    latest: getLatestEvent,
    summary: getSummary,
    getActive: getActiveEvent,
    isTerminal: isTerminal,
  };
}

