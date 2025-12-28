/**
 * Playback Network Trace - DEV-only instrumentation for diagnosing playback startup latency.
 * 
 * This module captures ALL network requests during the playback "critical path"
 * (from user click to first audible audio), correlated to the TTFA requestId.
 * 
 * DEV-ONLY: Must not run in production builds.
 * 
 * Usage:
 * - Call beginTrace(requestId, meta) when playback loading starts
 * - All fetch requests are automatically captured while trace is active
 * - Call endTrace(requestId, outcome) when first audio plays or loading fails
 * - View traces via window.__playbackTrace in dev tools
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single network request event captured during a trace.
 */
export interface NetworkEvent {
  ts: number;              // performance.now() timestamp when request started
  method: string;          // HTTP method (GET, POST, etc.)
  url: string;             // Full request URL
  status: number | 'ERR';  // HTTP status code or 'ERR' for network failures
  durationMs: number;      // Time from request start to response/error
  errorMessage?: string;   // Error message if status === 'ERR'
  hostname: string;        // Extracted hostname for categorization
  pathname: string;        // Extracted pathname for categorization
}

/**
 * Metadata provided when starting a trace.
 */
export interface TraceMeta {
  triggerType?: string;
  channelId?: string;
  channelName?: string;
  energyLevel?: string;
  engineType?: string;
}

/**
 * Outcome provided when ending a trace.
 */
export interface TraceOutcome {
  outcome: 'success' | 'fail';
  ttfaMs?: number;
  reason?: string;
}

/**
 * Summary statistics for a completed trace.
 */
export interface TraceSummary {
  totalRequests: number;
  totalDurationMs: number;
  byHostname: Record<string, { count: number; totalMs: number }>;
  byEndpoint: Record<string, number>;  // pathname -> count
  slowestRequests: Array<{ url: string; durationMs: number; method: string; pathname: string }>;
}

/**
 * Heuristic warning detected in a trace.
 */
export interface TraceWarning {
  type: string;
  message: string;
  severity: 'warning' | 'error';
}

/**
 * A complete playback trace.
 */
export interface PlaybackTrace {
  requestId: string;
  meta: TraceMeta;
  startedAt: number;       // performance.now() when trace began
  endedAt?: number;        // performance.now() when trace ended
  outcome?: TraceOutcome;
  events: NetworkEvent[];
  summary?: TraceSummary;
  active: boolean;         // True if trace is still collecting events
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Maximum number of traces to keep in the ring buffer.
 */
const MAX_TRACES = 50;

/**
 * Number of slowest requests to include in summary.
 */
const TOP_SLOW_COUNT = 5;

// ============================================================================
// STATE
// ============================================================================

/**
 * Ring buffer of completed traces.
 */
const traces: PlaybackTrace[] = [];

/**
 * Map of active (in-progress) traces by requestId.
 */
const activeTraces = new Map<string, PlaybackTrace>();

/**
 * Set of requestIds that have been ended (terminal state).
 */
const terminalTraces = new Set<string>();

// ============================================================================
// CORE API
// ============================================================================

/**
 * Begin a new trace for a playback request.
 * All subsequent fetch requests will be captured until endTrace is called.
 * 
 * @param requestId - The TTFA requestId to correlate with
 * @param meta - Optional metadata about the playback request
 */
export function beginTrace(requestId: string, meta: TraceMeta = {}): void {
  // Only run in DEV mode
  if (!import.meta.env.DEV) return;

  // Don't restart a trace that's already terminal
  if (terminalTraces.has(requestId)) {
    return;
  }

  const trace: PlaybackTrace = {
    requestId,
    meta,
    startedAt: performance.now(),
    events: [],
    active: true,
  };

  activeTraces.set(requestId, trace);

  if (import.meta.env.DEV) {
    console.log('[PLAYBACK_TRACE:BEGIN]', JSON.stringify({
      requestId,
      ...meta,
    }));
  }
}

/**
 * End a trace and compute summary statistics.
 * Produces a single structured log for diagnostics.
 * 
 * @param requestId - The requestId of the trace to end
 * @param outcome - The outcome of the playback attempt
 */
export function endTrace(requestId: string, outcome: TraceOutcome): void {
  // Only run in DEV mode
  if (!import.meta.env.DEV) return;

  // Terminal guard
  if (terminalTraces.has(requestId)) {
    return;
  }

  const trace = activeTraces.get(requestId);
  if (!trace) {
    return;
  }

  // Mark as terminal
  terminalTraces.add(requestId);
  trace.active = false;
  trace.endedAt = performance.now();
  trace.outcome = outcome;

  // Compute summary
  trace.summary = computeSummary(trace.events);

  // Move to completed traces
  activeTraces.delete(requestId);
  addToRingBuffer(trace);

  // Log the complete trace as a single structured JSON line (keep for parsing)
  console.log('[PLAYBACK_TRACE]', JSON.stringify({
    requestId,
    outcome: outcome.outcome,
    ttfaMs: outcome.ttfaMs,
    reason: outcome.reason,
    traceDurationMs: Math.round(trace.endedAt - trace.startedAt),
    networkSummary: {
      totalRequests: trace.summary.totalRequests,
      totalNetworkMs: trace.summary.totalDurationMs,
      byHostname: trace.summary.byHostname,
    },
    topSlowRequests: trace.summary.slowestRequests,
    endpointsByCount: trace.summary.byEndpoint,
    meta: trace.meta,
  }));

  // Log human-readable summary
  printTraceSummary(trace);
}

/**
 * Record a network event for an active trace.
 * Called by the fetch patch when a request completes.
 * 
 * @param requestId - The requestId of the active trace
 * @param event - The network event to record
 */
export function recordNetworkEvent(requestId: string, event: NetworkEvent): void {
  // Only run in DEV mode
  if (!import.meta.env.DEV) return;

  const trace = activeTraces.get(requestId);
  if (!trace || !trace.active) {
    return;
  }

  trace.events.push(event);
}

/**
 * Record a network event for ALL active traces.
 * Used when we can't determine which specific trace a request belongs to.
 */
export function recordNetworkEventToAll(event: NetworkEvent): void {
  // Only run in DEV mode
  if (!import.meta.env.DEV) return;

  activeTraces.forEach((trace) => {
    if (trace.active) {
      trace.events.push({ ...event });
    }
  });
}

/**
 * Check if any traces are currently active.
 */
export function hasActiveTraces(): boolean {
  if (!import.meta.env.DEV) return false;
  return activeTraces.size > 0;
}

/**
 * Get all active trace requestIds.
 */
export function getActiveTraceIds(): string[] {
  if (!import.meta.env.DEV) return [];
  return Array.from(activeTraces.keys());
}

/**
 * Get a specific trace by requestId (completed or active).
 */
export function getTrace(requestId: string): PlaybackTrace | undefined {
  if (!import.meta.env.DEV) return undefined;
  
  // Check active first
  const active = activeTraces.get(requestId);
  if (active) return active;

  // Check completed
  return traces.find(t => t.requestId === requestId);
}

/**
 * Clear a specific trace.
 */
export function clearTrace(requestId: string): void {
  if (!import.meta.env.DEV) return;
  
  activeTraces.delete(requestId);
  terminalTraces.delete(requestId);
  
  const index = traces.findIndex(t => t.requestId === requestId);
  if (index !== -1) {
    traces.splice(index, 1);
  }
}

/**
 * Get summary for a completed trace.
 */
export function summarizeTrace(requestId: string): TraceSummary | undefined {
  if (!import.meta.env.DEV) return undefined;
  
  const trace = getTrace(requestId);
  if (!trace) return undefined;
  
  // If already computed, return it
  if (trace.summary) return trace.summary;
  
  // Compute on demand (for active traces)
  return computeSummary(trace.events);
}

/**
 * Get all completed traces (newest first).
 */
export function getAllTraces(): PlaybackTrace[] {
  if (!import.meta.env.DEV) return [];
  return [...traces].reverse();
}

/**
 * Get the most recent completed trace.
 */
export function getLatestTrace(): PlaybackTrace | undefined {
  if (!import.meta.env.DEV) return undefined;
  return traces[traces.length - 1];
}

/**
 * Clear all traces and reset state.
 */
export function clearAllTraces(): void {
  if (!import.meta.env.DEV) return;
  
  traces.length = 0;
  activeTraces.clear();
  terminalTraces.clear();
}

/**
 * Get summary of all completed traces.
 */
export function getOverallSummary(): { 
  traceCount: number; 
  avgRequestsPerTrace: number;
  avgNetworkMsPerTrace: number;
} {
  if (!import.meta.env.DEV) return { traceCount: 0, avgRequestsPerTrace: 0, avgNetworkMsPerTrace: 0 };
  
  if (traces.length === 0) {
    return { traceCount: 0, avgRequestsPerTrace: 0, avgNetworkMsPerTrace: 0 };
  }

  const totalRequests = traces.reduce((sum, t) => sum + (t.summary?.totalRequests ?? 0), 0);
  const totalNetworkMs = traces.reduce((sum, t) => sum + (t.summary?.totalDurationMs ?? 0), 0);

  return {
    traceCount: traces.length,
    avgRequestsPerTrace: Math.round(totalRequests / traces.length),
    avgNetworkMsPerTrace: Math.round(totalNetworkMs / traces.length),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Compute summary statistics for a set of network events.
 */
function computeSummary(events: NetworkEvent[]): TraceSummary {
  const byHostname: Record<string, { count: number; totalMs: number }> = {};
  const byEndpoint: Record<string, number> = {};
  let totalDurationMs = 0;

  for (const event of events) {
    totalDurationMs += event.durationMs;

    // Group by hostname
    if (!byHostname[event.hostname]) {
      byHostname[event.hostname] = { count: 0, totalMs: 0 };
    }
    byHostname[event.hostname].count++;
    byHostname[event.hostname].totalMs += event.durationMs;

    // Group by endpoint (pathname)
    const endpoint = event.pathname || '/';
    byEndpoint[endpoint] = (byEndpoint[endpoint] || 0) + 1;
  }

  // Get slowest requests
  const sortedByDuration = [...events].sort((a, b) => b.durationMs - a.durationMs);
  const slowestRequests = sortedByDuration.slice(0, TOP_SLOW_COUNT).map(e => ({
    url: e.url,
    durationMs: Math.round(e.durationMs),
    method: e.method,
    pathname: e.pathname,
  }));

  return {
    totalRequests: events.length,
    totalDurationMs: Math.round(totalDurationMs),
    byHostname,
    byEndpoint,
    slowestRequests,
  };
}

/**
 * Add a trace to the ring buffer.
 */
function addToRingBuffer(trace: PlaybackTrace): void {
  traces.push(trace);
  if (traces.length > MAX_TRACES) {
    traces.shift();
  }
}

/**
 * Parse URL to extract hostname and pathname.
 */
export function parseUrl(url: string): { hostname: string; pathname: string } {
  try {
    const parsed = new URL(url);
    return {
      hostname: parsed.hostname,
      pathname: parsed.pathname,
    };
  } catch {
    // Fallback for relative URLs or malformed URLs
    return {
      hostname: 'unknown',
      pathname: url.split('?')[0],
    };
  }
}

// ============================================================================
// HEURISTIC WARNING DETECTION
// ============================================================================

/**
 * Detect heuristic warnings in a trace.
 */
export function detectWarnings(trace: PlaybackTrace): TraceWarning[] {
  const warnings: TraceWarning[] = [];
  const events = trace.events;

  // 1. Duplicate user_preferences reads/writes
  const userPrefsEvents = events.filter(e => 
    e.pathname.includes('user_preferences')
  );
  if (userPrefsEvents.length > 1) {
    warnings.push({
      type: 'duplicate_user_preferences',
      message: `Multiple user_preferences calls (${userPrefsEvents.length}x) - consider caching`,
      severity: 'warning',
    });
  }

  // 2. audio_tracks?select=* (fetching all columns)
  const selectAllEvents = events.filter(e => 
    e.url.includes('audio_tracks') && e.url.includes('select=*')
  );
  if (selectAllEvents.length > 0) {
    warnings.push({
      type: 'audio_tracks_select_all',
      message: `audio_tracks?select=* found (${selectAllEvents.length}x) - select only needed columns`,
      severity: 'warning',
    });
  }

  // 3. Analytics RPC before audio (track_play_events, listening_sessions)
  const analyticsEvents = events.filter(e => 
    e.pathname.includes('track_play_events') || 
    e.pathname.includes('listening_sessions') ||
    e.pathname.includes('rpc/update_track')
  );
  if (analyticsEvents.length > 0 && trace.outcome?.outcome === 'success') {
    // Check if analytics happened before TTFA completed
    const ttfaMs = trace.outcome.ttfaMs || 0;
    const earlyAnalytics = analyticsEvents.filter(e => 
      (e.ts - trace.startedAt) < ttfaMs
    );
    if (earlyAnalytics.length > 0) {
      warnings.push({
        type: 'analytics_before_audio',
        message: `Analytics calls (${earlyAnalytics.length}x) fired before first audio - consider deferring`,
        severity: 'warning',
      });
    }
  }

  // 4. Duplicate slot_strategies or playlist generation
  const slotStrategyEvents = events.filter(e => 
    e.pathname.includes('slot_strategies') || 
    e.pathname.includes('slot_definitions')
  );
  if (slotStrategyEvents.length > 1) {
    warnings.push({
      type: 'duplicate_slot_strategy',
      message: `Multiple slot_strategy fetches (${slotStrategyEvents.length}x) - use cache`,
      severity: 'warning',
    });
  }

  return warnings;
}

// ============================================================================
// HUMAN-READABLE SUMMARY
// ============================================================================

/**
 * Format milliseconds for display.
 */
function formatMs(ms: number | undefined): string {
  if (ms === undefined || ms === null) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Truncate pathname for display.
 */
function truncatePath(pathname: string, maxLen = 40): string {
  if (pathname.length <= maxLen) return pathname;
  return '...' + pathname.slice(-maxLen + 3);
}

/**
 * Print a human-readable trace summary to console.
 */
function printTraceSummary(trace: PlaybackTrace): void {
  if (!import.meta.env.DEV) return;

  const meta = trace.meta;
  const outcome = trace.outcome;
  const summary = trace.summary;
  const warnings = detectWarnings(trace);

  const outcomeIcon = outcome?.outcome === 'success' ? '✅' : '❌';
  const ttfaDisplay = formatMs(outcome?.ttfaMs);

  // Build summary lines
  const lines: string[] = [
    `╭──────────────────────────────────────────────────────────────╮`,
    `│ PLAYBACK TRACE SUMMARY                                       │`,
    `├──────────────────────────────────────────────────────────────┤`,
    `│ ${outcomeIcon} ${outcome?.outcome?.toUpperCase() || 'UNKNOWN'}  TTFA: ${ttfaDisplay.padEnd(10)} requestId: ${trace.requestId.slice(0, 8)}...`,
    `│ Trigger: ${(meta.triggerType || 'unknown').padEnd(15)} Channel: ${(meta.channelName || meta.channelId || 'unknown').slice(0, 20)}`,
    `│ Energy: ${(meta.energyLevel || 'unknown').padEnd(16)} Engine: ${meta.engineType || 'unknown'}`,
    `├──────────────────────────────────────────────────────────────┤`,
    `│ Network: ${summary?.totalRequests || 0} requests, ${formatMs(summary?.totalDurationMs)} total`,
  ];

  // Add hostname breakdown
  if (summary?.byHostname) {
    const hostnames = Object.entries(summary.byHostname)
      .sort((a, b) => b[1].totalMs - a[1].totalMs)
      .slice(0, 3);
    
    for (const [hostname, data] of hostnames) {
      const shortHost = hostname.length > 30 ? hostname.slice(0, 27) + '...' : hostname;
      lines.push(`│   ${shortHost.padEnd(30)} ${String(data.count).padStart(3)} reqs  ${formatMs(data.totalMs).padStart(8)}`);
    }
  }

  // Add top 5 slowest requests
  if (summary?.slowestRequests && summary.slowestRequests.length > 0) {
    lines.push(`├──────────────────────────────────────────────────────────────┤`);
    lines.push(`│ Slowest Requests:`);
    for (const req of summary.slowestRequests.slice(0, 5)) {
      const path = truncatePath(req.pathname, 35);
      lines.push(`│   ${req.method.padEnd(4)} ${path.padEnd(38)} ${formatMs(req.durationMs).padStart(8)}`);
    }
  }

  // Add endpoint counts (top 5)
  if (summary?.byEndpoint) {
    const endpoints = Object.entries(summary.byEndpoint)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    if (endpoints.length > 0) {
      lines.push(`├──────────────────────────────────────────────────────────────┤`);
      lines.push(`│ Endpoint Counts:`);
      for (const [endpoint, count] of endpoints) {
        const path = truncatePath(endpoint, 45);
        lines.push(`│   ${path.padEnd(50)} ${String(count).padStart(3)}x`);
      }
    }
  }

  // Add warnings
  if (warnings.length > 0) {
    lines.push(`├──────────────────────────────────────────────────────────────┤`);
    lines.push(`│ ⚠️  Warnings (${warnings.length}):`);
    for (const warning of warnings) {
      const icon = warning.severity === 'error' ? '❌' : '⚠️';
      lines.push(`│   ${icon} ${warning.message.slice(0, 55)}`);
    }
  }

  lines.push(`╰──────────────────────────────────────────────────────────────╯`);

  // Log as a single formatted block
  console.log('[PLAYBACK_TRACE_SUMMARY]\n' + lines.join('\n'));
}

/**
 * Generate a human-readable summary string for a trace (for CLI/export).
 */
export function generateTraceSummaryText(trace: PlaybackTrace): string {
  const meta = trace.meta;
  const outcome = trace.outcome;
  const summary = trace.summary;
  const warnings = detectWarnings(trace);

  const outcomeIcon = outcome?.outcome === 'success' ? '✅' : '❌';
  const ttfaDisplay = formatMs(outcome?.ttfaMs);

  const lines: string[] = [
    `${outcomeIcon} ${outcome?.outcome?.toUpperCase() || 'UNKNOWN'}  TTFA: ${ttfaDisplay}  requestId: ${trace.requestId}`,
    `Trigger: ${meta.triggerType || 'unknown'}  Channel: ${meta.channelName || meta.channelId || 'unknown'}  Energy: ${meta.energyLevel || 'unknown'}`,
    `Network: ${summary?.totalRequests || 0} requests, ${formatMs(summary?.totalDurationMs)} total`,
  ];

  // Hostname breakdown
  if (summary?.byHostname) {
    const hostnames = Object.entries(summary.byHostname)
      .sort((a, b) => b[1].totalMs - a[1].totalMs);
    
    lines.push('Breakdown by Host:');
    for (const [hostname, data] of hostnames) {
      lines.push(`  ${hostname}: ${data.count} reqs, ${formatMs(data.totalMs)}`);
    }
  }

  // Slowest requests
  if (summary?.slowestRequests && summary.slowestRequests.length > 0) {
    lines.push('Slowest Requests:');
    for (const req of summary.slowestRequests) {
      lines.push(`  ${req.method} ${req.pathname} - ${formatMs(req.durationMs)}`);
    }
  }

  // Warnings
  if (warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of warnings) {
      lines.push(`  ⚠️ ${warning.message}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// DOWNLOAD / EXPORT FUNCTIONS
// ============================================================================

/**
 * Download the latest trace as a JSON file.
 * Creates a Blob and triggers a browser download.
 */
export function downloadLatest(): boolean {
  if (!import.meta.env.DEV) return false;
  
  const trace = getLatestTrace();
  if (!trace) {
    console.warn('[PLAYBACK_TRACE] No traces to download');
    return false;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `playback-trace-${timestamp}.json`;
  const json = JSON.stringify(trace, null, 2);

  triggerDownload(json, filename, 'application/json');
  console.log(`[PLAYBACK_TRACE] Downloaded: ${filename}`);
  return true;
}

/**
 * Download all traces as a single JSON file.
 */
export function downloadAll(): boolean {
  if (!import.meta.env.DEV) return false;
  
  const allTraces = getAllTraces();
  if (allTraces.length === 0) {
    console.warn('[PLAYBACK_TRACE] No traces to download');
    return false;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `playback-traces-all-${timestamp}.json`;
  const json = JSON.stringify(allTraces, null, 2);

  triggerDownload(json, filename, 'application/json');
  console.log(`[PLAYBACK_TRACE] Downloaded ${allTraces.length} traces: ${filename}`);
  return true;
}

/**
 * Trigger a browser file download.
 */
function triggerDownload(content: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  
  document.body.appendChild(a);
  a.click();
  
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ============================================================================
// DEV MODE EXPOSURE
// ============================================================================

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__playbackTrace = {
    // Trace retrieval
    traces: getAllTraces,
    latest: getLatestTrace,
    get: getTrace,
    summary: summarizeTrace,
    overall: getOverallSummary,
    active: getActiveTraceIds,
    hasActive: hasActiveTraces,
    // Utilities
    clear: clearAllTraces,
    warnings: (requestId?: string) => {
      const trace = requestId ? getTrace(requestId) : getLatestTrace();
      return trace ? detectWarnings(trace) : [];
    },
    // Export / Download
    downloadLatest,
    downloadAll,
    // Text summary (for copy/paste)
    printSummary: (requestId?: string) => {
      const trace = requestId ? getTrace(requestId) : getLatestTrace();
      if (trace) {
        console.log(generateTraceSummaryText(trace));
      } else {
        console.warn('No trace found');
      }
    },
  };
}

