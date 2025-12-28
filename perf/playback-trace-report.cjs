#!/usr/bin/env node
/**
 * Playback Trace Diagnosis Report CLI
 * 
 * Analyzes playback network traces to identify performance issues
 * and wasted network calls during playback startup.
 * 
 * Usage:
 *   node perf/playback-trace-report.cjs [path-to-json]
 *   npm run playback:report
 * 
 * Default input: perf/playback-trace-latest.json
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

// ============================================================================
// THRESHOLDS & HEURISTICS
// ============================================================================

const THRESHOLDS = {
  supabaseMaxMs: 400,       // Flag if Supabase total > 400ms
  hlsMaxMs: 1000,           // Flag if HLS total > 1000ms
  ttfaGood: 4000,           // Excellent TTFA
  ttfaAcceptable: 8000,     // Acceptable TTFA
};

// Patterns that indicate duplicate/wasteful requests
const DUPLICATE_PATTERNS = {
  user_preferences: /user_preferences/,
  audio_tracks: /audio_tracks/,
  playlist_generation: /slot_strategies|audio_tracks.*channel_id/,
};

// ============================================================================
// HELPERS
// ============================================================================

function formatMs(ms) {
  if (ms === undefined || ms === null) return 'N/A';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncateUrl(url, maxLen = 80) {
  if (!url) return '';
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

function getVerdictEmoji(issues) {
  if (issues.length === 0) return '✅';
  if (issues.some(i => i.severity === 'error')) return '❌';
  return '⚠️';
}

function getSeverityColor(severity) {
  switch (severity) {
    case 'error': return colors.red;
    case 'warning': return colors.yellow;
    default: return colors.gray;
  }
}

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze a single trace for issues.
 */
function analyzeTrace(trace) {
  const issues = [];
  const events = trace.events || [];
  const resourceTiming = trace.resourceTimingEvents || [];
  const resourceSummary = trace.resourceTimingSummary || {};
  const summary = trace.summary || {};

  // 1. Check Supabase total time
  const supabaseData = summary.byHostname || {};
  let supabaseTotalMs = 0;
  let supabaseCount = 0;
  for (const [hostname, data] of Object.entries(supabaseData)) {
    if (hostname.includes('supabase')) {
      supabaseTotalMs += data.totalMs || 0;
      supabaseCount += data.count || 0;
    }
  }

  if (supabaseTotalMs > THRESHOLDS.supabaseMaxMs) {
    issues.push({
      type: 'slow_supabase',
      severity: 'warning',
      message: `Supabase totalMs (${formatMs(supabaseTotalMs)}) > ${formatMs(THRESHOLDS.supabaseMaxMs)} threshold`,
      details: `${supabaseCount} requests`,
    });
  }

  // 2. Check HLS total time (from resource timing)
  const hls = resourceSummary.hls || {};
  if (hls.totalDurationMs > THRESHOLDS.hlsMaxMs) {
    issues.push({
      type: 'slow_hls',
      severity: 'warning',
      message: `HLS totalMs (${formatMs(hls.totalDurationMs)}) > ${formatMs(THRESHOLDS.hlsMaxMs)} threshold`,
      details: `${hls.m3u8Count} manifests, ${hls.tsCount} segments`,
    });
  }

  // 3. Check for duplicate requests to same endpoint
  const endpointCounts = summary.byEndpoint || {};
  for (const [endpoint, count] of Object.entries(endpointCounts)) {
    if (count > 1) {
      issues.push({
        type: 'duplicate_endpoint',
        severity: 'warning',
        message: `Duplicate requests to ${truncateUrl(endpoint, 50)} (${count}x)`,
        details: 'Consider caching or deduplication',
      });
    }
  }

  // 4. Check for multiple user_preferences fetches
  const userPrefsEvents = events.filter(e => 
    DUPLICATE_PATTERNS.user_preferences.test(e.url || e.pathname || '')
  );
  if (userPrefsEvents.length > 1) {
    issues.push({
      type: 'duplicate_user_preferences',
      severity: 'error',
      message: `Multiple user_preferences fetches in same trace (${userPrefsEvents.length}x)`,
      details: 'Should be cached during playback request',
    });
  }

  // 5. Check for multiple audio_tracks fetches
  const audioTracksEvents = events.filter(e => {
    const urlOrPath = e.url || e.pathname || '';
    return urlOrPath.includes('audio_tracks') && !urlOrPath.includes('channel_id');
  });
  if (audioTracksEvents.length > 1) {
    issues.push({
      type: 'duplicate_audio_tracks',
      severity: 'error',
      message: `Multiple audio_tracks fetches in same trace (${audioTracksEvents.length}x)`,
      details: 'Should be cached during playback request',
    });
  }

  // 6. Check for select=* pattern (fetching all columns)
  const selectAllEvents = events.filter(e => {
    const url = e.url || '';
    return url.includes('audio_tracks') && url.includes('select=*');
  });
  if (selectAllEvents.length > 0) {
    issues.push({
      type: 'select_all_columns',
      severity: 'warning',
      message: `audio_tracks?select=* found (${selectAllEvents.length}x)`,
      details: 'Should select only needed columns for faster responses',
    });
  }

  // 7. Check for multiple playlist generation requests
  const playlistGenEvents = events.filter(e => 
    DUPLICATE_PATTERNS.playlist_generation.test(e.url || e.pathname || '')
  );
  if (playlistGenEvents.length > 1) {
    issues.push({
      type: 'duplicate_playlist_gen',
      severity: 'warning',
      message: `Multiple playlist/slot_strategy requests (${playlistGenEvents.length}x)`,
      details: 'Should only happen once per requestId',
    });
  }

  // 8. Check for analytics calls before audio (blocking fast start)
  const analyticsEvents = events.filter(e => {
    const urlOrPath = e.url || e.pathname || '';
    return urlOrPath.includes('track_play_events') || 
           urlOrPath.includes('listening_sessions') ||
           urlOrPath.includes('rpc/update_track');
  });
  if (analyticsEvents.length > 0 && trace.outcome?.outcome === 'success') {
    const ttfaMs = trace.outcome.ttfaMs || 0;
    // Check if analytics requests completed before TTFA (they'd be blocking)
    const earlyAnalytics = analyticsEvents.filter(e => {
      const requestTs = e.ts || 0;
      const startTs = trace.startedAt || 0;
      return (requestTs - startTs) < ttfaMs;
    });
    if (earlyAnalytics.length > 0) {
      issues.push({
        type: 'analytics_before_audio',
        severity: 'warning',
        message: `Analytics calls (${earlyAnalytics.length}x) fired before first audio`,
        details: 'Consider deferring analytics until after TTFA',
      });
    }
  }

  return issues;
}

/**
 * Compute aggregate stats across all traces.
 */
function computeAggregateStats(traces) {
  const ttfaValues = traces
    .filter(t => t.outcome?.outcome === 'success' && typeof t.outcome?.ttfaMs === 'number')
    .map(t => t.outcome.ttfaMs)
    .sort((a, b) => a - b);

  const traceDurations = traces
    .filter(t => t.endedAt && t.startedAt)
    .map(t => t.endedAt - t.startedAt)
    .sort((a, b) => a - b);

  return {
    count: traces.length,
    successCount: traces.filter(t => t.outcome?.outcome === 'success').length,
    failCount: traces.filter(t => t.outcome?.outcome === 'fail').length,
    ttfa: {
      p50: percentile(ttfaValues, 50),
      p95: percentile(ttfaValues, 95),
      max: ttfaValues[ttfaValues.length - 1] || 0,
      min: ttfaValues[0] || 0,
    },
    traceDuration: {
      p50: percentile(traceDurations, 50),
      p95: percentile(traceDurations, 95),
    },
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// ============================================================================
// REPORT PRINTING
// ============================================================================

function printHeader() {
  console.log('');
  console.log(`${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║              PLAYBACK TRACE DIAGNOSIS REPORT                             ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚══════════════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
}

function printTraceEvent(trace, index) {
  const outcome = trace.outcome || {};
  const meta = trace.meta || {};
  const summary = trace.summary || {};
  const resourceSummary = trace.resourceTimingSummary || {};

  const outcomeColor = outcome.outcome === 'success' ? colors.green : colors.red;
  const ttfaColor = (outcome.ttfaMs || 0) <= THRESHOLDS.ttfaGood 
    ? colors.green 
    : (outcome.ttfaMs || 0) <= THRESHOLDS.ttfaAcceptable 
      ? colors.yellow 
      : colors.red;

  console.log(`${colors.bright}━━━ Trace ${index + 1}: ${trace.requestId?.substring(0, 8) || 'unknown'}... ━━━${colors.reset}`);
  console.log(`  requestId:      ${trace.requestId || 'N/A'}`);
  console.log(`  triggerType:    ${meta.triggerType || 'N/A'}`);
  console.log(`  ttfaMs:         ${ttfaColor}${formatMs(outcome.ttfaMs)}${colors.reset}`);
  console.log(`  outcome:        ${outcomeColor}${outcome.outcome || 'N/A'}${colors.reset}${outcome.reason ? ` (${outcome.reason})` : ''}`);
  console.log(`  audioType:      ${meta.engineType || 'N/A'}`);
  console.log(`  traceDurationMs: ${formatMs(trace.endedAt && trace.startedAt ? trace.endedAt - trace.startedAt : undefined)}`);
  console.log('');
}

function printBreakdownByHostname(traces) {
  console.log(`${colors.bright}${colors.blue}Breakdown by Hostname (all traces combined):${colors.reset}`);
  
  // Aggregate by hostname across all traces
  const byHostname = {};
  for (const trace of traces) {
    const summary = trace.summary?.byHostname || {};
    for (const [hostname, data] of Object.entries(summary)) {
      if (!byHostname[hostname]) {
        byHostname[hostname] = { count: 0, totalMs: 0 };
      }
      byHostname[hostname].count += data.count || 0;
      byHostname[hostname].totalMs += data.totalMs || 0;
    }
  }

  // Sort by total time
  const sorted = Object.entries(byHostname)
    .sort((a, b) => b[1].totalMs - a[1].totalMs);

  for (const [hostname, data] of sorted) {
    const isSupabase = hostname.includes('supabase');
    const color = isSupabase ? colors.magenta : colors.gray;
    console.log(`  ${color}${hostname.padEnd(40)}${colors.reset} ${String(data.count).padStart(4)} reqs  ${formatMs(data.totalMs).padStart(10)}`);
  }
  console.log('');
}

function printResourceTimingSummary(traces) {
  // Aggregate resource timing across all traces
  let totalBytes = 0;
  let totalDurationMs = 0;
  let totalHlsBytes = 0;
  let totalHlsMs = 0;
  let m3u8Count = 0;
  let tsCount = 0;

  for (const trace of traces) {
    const rs = trace.resourceTimingSummary || {};
    totalBytes += rs.totalBytesTransferred || 0;
    totalDurationMs += rs.totalDurationMs || 0;
    
    const hls = rs.hls || {};
    totalHlsBytes += hls.totalBytes || 0;
    totalHlsMs += hls.totalDurationMs || 0;
    m3u8Count += hls.m3u8Count || 0;
    tsCount += hls.tsCount || 0;
  }

  console.log(`${colors.bright}${colors.blue}Resource Timing Summary (all traces):${colors.reset}`);
  console.log(`  Total bytes transferred:  ${formatBytes(totalBytes)}`);
  console.log(`  Total resource duration:  ${formatMs(totalDurationMs)}`);
  console.log(`  HLS manifests (.m3u8):    ${m3u8Count}`);
  console.log(`  HLS segments (.ts):       ${tsCount}`);
  console.log(`  HLS total bytes:          ${formatBytes(totalHlsBytes)}`);
  console.log(`  HLS total duration:       ${formatMs(totalHlsMs)}`);
  console.log('');
}

function printTopSlowRequests(traces) {
  // Collect all slow requests from all traces
  const allSlow = [];
  for (const trace of traces) {
    const slowReqs = trace.summary?.slowestRequests || [];
    for (const req of slowReqs) {
      allSlow.push({
        ...req,
        traceId: trace.requestId?.substring(0, 8) || 'unknown',
      });
    }
  }

  // Sort and take top 10
  const top10 = allSlow
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  if (top10.length === 0) {
    console.log(`${colors.gray}No slow requests recorded.${colors.reset}`);
    return;
  }

  console.log(`${colors.bright}${colors.blue}Top 10 Slowest Requests:${colors.reset}`);
  for (let i = 0; i < top10.length; i++) {
    const req = top10[i];
    const durationColor = req.durationMs > 500 ? colors.red : req.durationMs > 200 ? colors.yellow : colors.gray;
    const method = req.method ? `${req.method.padEnd(4)}` : '    ';
    const pathname = req.pathname ? truncateUrl(req.pathname, 45) : truncateUrl(req.url, 45);
    console.log(`  ${(i + 1).toString().padStart(2)}. ${method} ${pathname.padEnd(48)} ${durationColor}${formatMs(req.durationMs).padStart(8)}${colors.reset}`);
  }
  console.log('');
}

function printIssues(allIssues) {
  if (allIssues.length === 0) {
    console.log(`${colors.green}${colors.bright}✅ No issues detected!${colors.reset}`);
    console.log('');
    return;
  }

  // Group by type
  const byType = {};
  for (const issue of allIssues) {
    if (!byType[issue.type]) {
      byType[issue.type] = [];
    }
    byType[issue.type].push(issue);
  }

  console.log(`${colors.bright}${colors.yellow}Issues Detected (${allIssues.length}):${colors.reset}`);
  for (const [type, issues] of Object.entries(byType)) {
    const firstIssue = issues[0];
    const color = getSeverityColor(firstIssue.severity);
    const emoji = firstIssue.severity === 'error' ? '❌' : '⚠️';
    console.log(`  ${emoji} ${color}${type}${colors.reset} (${issues.length}x)`);
    // Show first occurrence details
    console.log(`     ${colors.dim}${firstIssue.message}${colors.reset}`);
    if (firstIssue.details) {
      console.log(`     ${colors.dim}→ ${firstIssue.details}${colors.reset}`);
    }
  }
  console.log('');
}

function printAggregateStats(stats) {
  console.log(`${colors.bright}${colors.blue}Aggregate Statistics:${colors.reset}`);
  console.log(`  Total traces:     ${stats.count}`);
  console.log(`  Successes:        ${colors.green}${stats.successCount}${colors.reset}`);
  console.log(`  Failures:         ${stats.failCount > 0 ? colors.red : colors.gray}${stats.failCount}${colors.reset}`);
  console.log('');
  
  if (stats.successCount > 0) {
    const p50Color = stats.ttfa.p50 <= THRESHOLDS.ttfaGood ? colors.green : colors.yellow;
    const p95Color = stats.ttfa.p95 <= THRESHOLDS.ttfaAcceptable ? colors.green : 
                     stats.ttfa.p95 <= THRESHOLDS.ttfaAcceptable * 1.5 ? colors.yellow : colors.red;
    
    console.log(`${colors.bright}TTFA Statistics:${colors.reset}`);
    console.log(`  Min:    ${formatMs(stats.ttfa.min)}`);
    console.log(`  P50:    ${p50Color}${formatMs(stats.ttfa.p50)}${colors.reset}`);
    console.log(`  P95:    ${p95Color}${formatMs(stats.ttfa.p95)}${colors.reset}`);
    console.log(`  Max:    ${formatMs(stats.ttfa.max)}`);
    console.log('');
  }
}

function printVerdict(allIssues, stats) {
  const hasErrors = allIssues.some(i => i.severity === 'error');
  const hasWarnings = allIssues.some(i => i.severity === 'warning');
  const ttfaGood = stats.ttfa.p95 <= THRESHOLDS.ttfaAcceptable;

  console.log(`${colors.bright}Verdict:${colors.reset}`);
  
  if (!hasErrors && !hasWarnings && ttfaGood) {
    console.log(`  ${colors.green}${colors.bright}✅ PASS - No issues, TTFA within threshold${colors.reset}`);
  } else if (hasErrors) {
    console.log(`  ${colors.red}${colors.bright}❌ FAIL - Critical issues found (duplicate reads, etc.)${colors.reset}`);
  } else if (!ttfaGood) {
    console.log(`  ${colors.red}${colors.bright}❌ FAIL - TTFA P95 exceeds threshold${colors.reset}`);
  } else {
    console.log(`  ${colors.yellow}${colors.bright}⚠️ WARN - Minor issues found (review recommended)${colors.reset}`);
  }
  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  // Get input file path
  const inputFile = process.argv[2] || path.join(__dirname, 'playback-trace-latest.json');

  // Check if file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`${colors.red}Error: File not found: ${inputFile}${colors.reset}`);
    console.log('');
    console.log('Usage: node perf/playback-trace-report.cjs [path-to-json]');
    console.log('');
    console.log('Generate trace data by:');
    console.log('  1. Run the app locally (npm run dev)');
    console.log('  2. Perform playback actions (channel switch, energy change)');
    console.log('  3. Run: window.__playbackTrace.downloadLatest() in dev console');
    console.log('  4. Move downloaded file to perf/playback-trace-latest.json');
    console.log('');
    console.log('The console will automatically show [PLAYBACK_TRACE_SUMMARY] after each trace.');
    console.log('');
    process.exit(1);
  }

  // Read and parse JSON
  let traces;
  try {
    const content = fs.readFileSync(inputFile, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Handle both single trace and array of traces
    if (Array.isArray(parsed)) {
      traces = parsed;
    } else if (parsed.requestId) {
      // Single trace
      traces = [parsed];
    } else {
      throw new Error('Expected a trace object or array of traces');
    }
  } catch (error) {
    console.error(`${colors.red}Error parsing JSON: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  if (traces.length === 0) {
    console.log(`${colors.yellow}No traces found in ${inputFile}${colors.reset}`);
    process.exit(0);
  }

  console.log(`${colors.gray}Reading: ${inputFile}${colors.reset}`);
  console.log(`${colors.gray}Traces found: ${traces.length}${colors.reset}`);

  // Print report
  printHeader();

  // Print each trace event
  console.log(`${colors.bright}${colors.blue}Trace Events:${colors.reset}`);
  console.log('');
  for (let i = 0; i < traces.length; i++) {
    printTraceEvent(traces[i], i);
  }

  // Print breakdown by hostname
  printBreakdownByHostname(traces);

  // Print resource timing summary
  printResourceTimingSummary(traces);

  // Print top slow requests
  printTopSlowRequests(traces);

  // Analyze all traces for issues
  const allIssues = [];
  for (const trace of traces) {
    const issues = analyzeTrace(trace);
    for (const issue of issues) {
      allIssues.push({
        ...issue,
        traceId: trace.requestId,
      });
    }
  }

  // Print issues
  printIssues(allIssues);

  // Compute and print aggregate stats
  const stats = computeAggregateStats(traces);
  printAggregateStats(stats);

  // Print verdict
  printVerdict(allIssues, stats);

  // Classification summary
  console.log(`${colors.bright}Classification:${colors.reset}`);
  console.log(`  Startup blockers:  Supabase queries, HLS manifest/segment loads`);
  console.log(`  Non-critical:      Analytics writes, preference upserts, metadata`);
  console.log('');
}

main();

