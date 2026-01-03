import { test, expect, Page } from '@playwright/test';
import { loginAsUser } from '../../tests/helpers/auth';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E test suite for generating playback performance baselines.
 * 
 * This suite triggers the 3 core playback flows:
 * 1. Initial play (channel start)
 * 2. Energy change (same channel)
 * 3. Channel change (switch to different channel)
 * 
 * After running, traces are automatically exported to:
 *   perf/runs/YYYY-MM-DD_HH-mm-ss/
 * 
 * Usage:
 *   npm run playback:baseline
 *   npx playwright test playback-baseline.spec.ts
 */

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;
const hasTestCredentials = TEST_USER_EMAIL && TEST_USER_PASSWORD;

// Generate timestamped run directory
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUN_DIR = process.env.PERF_RUN_DIR || path.join(process.cwd(), 'perf', 'runs', RUN_TIMESTAMP);

// Thresholds for regression checks
const THRESHOLDS = {
  ttfaP95Ms: 4000,           // TTFA P95 must be under 4s
  maxFetchesPerTrace: 20,    // Max fetch requests per trace
  maxDuplicateUserPrefs: 1,  // No duplicate user_preferences
  maxDuplicateSlotStrategy: 0, // Phase 4.8: slot_strategy duplicates should be eliminated
};

interface TTFAEvent {
  requestId: string;
  triggerType: string;
  ttfaMs?: number;
  success?: boolean;
  error?: string;
  channelName?: string;
  energyLevel?: string;
  timestamp?: string;
}

interface NetworkEvent {
  ts: number;
  method: string;
  url: string;
  status: number | 'ERR';
  durationMs: number;
  hostname: string;
  pathname: string;
}

interface TraceSummary {
  totalRequests: number;
  totalDurationMs: number;
  byHostname: Record<string, { count: number; totalMs: number }>;
  byEndpoint: Record<string, number>;
  slowestRequests: Array<{ url: string; durationMs: number; method: string; pathname: string }>;
}

interface PlaybackTrace {
  requestId: string;
  meta: {
    triggerType?: string;
    channelId?: string;
    channelName?: string;
    energyLevel?: string;
    engineType?: string;
  };
  startedAt: number;
  endedAt?: number;
  outcome?: {
    outcome: 'success' | 'fail';
    ttfaMs?: number;
    reason?: string;
  };
  events: NetworkEvent[];
  summary?: TraceSummary;
  // [PHASE 4.1] Separated event buckets for clean TTFA measurement
  ttfaWindowEvents?: NetworkEvent[];
  ttfaWindowSummary?: TraceSummary;
  postAudioEvents?: NetworkEvent[];
  postAudioSummary?: TraceSummary;
}

/**
 * [PHASE 4.5] Canonical slot sequencer channel names (source of truth).
 * 
 * These channels use slot-based playlist generation with:
 * - Track pool + global filters
 * - Slot strategies, definitions, rule groups
 * 
 * All other channels are admin-curated (explicit track list ordering).
 * 
 * IMPORTANT: Use exact channel names for matching. Do NOT add channels
 * to this list without confirming they use slot_strategies in the database.
 */
const SLOT_SEQUENCER_CHANNELS = [
  'Tranquility',
  'The Drop',
  'The Deep',
  'Organica',
  'The Duke',
  'Symphonica',
  'PowerTool',
  'Edwardian',
  'Cinematic',
  'Bach Beats',
  'Atmosphere',
  'Aquascope',
];

/**
 * [PHASE 4.5] Preferred slot sequencer channels for Flow 4 testing.
 * These are the most reliable/stable for baseline measurements.
 */
const PREFERRED_SLOT_SEQ_CHANNELS = ['The Deep', 'The Drop'];

interface BaselineReport {
  runId: string;
  timestamp: string;
  traces: PlaybackTrace[];
  ttfaEvents: TTFAEvent[];
  summary: {
    traceCount: number;
    successCount: number;
    failCount: number;
    ttfa: {
      min: number;
      p50: number;
      p95: number;
      max: number;
    };
    byTriggerType: Record<string, {
      count: number;
      p50Ms: number;
      p95Ms: number;
      avgFetches: number;
    }>;
    // [PHASE 4.4] Per-channel-type breakdown for slot sequencer analysis
    byChannelType?: {
      slotSequencer: {
        count: number;
        p50Ms: number;
        p95Ms: number;
        avgFetches: number;
        channelNames: string[];
      };
      adminCurated: {
        count: number;
        p50Ms: number;
        p95Ms: number;
        avgFetches: number;
        channelNames: string[];
      };
    };
    totalFetches: number;
    avgFetchesPerTrace: number;
    warnings: Array<{
      type: string;
      count: number;
    }>;
  };
  thresholds: typeof THRESHOLDS;
  verdict: {
    pass: boolean;
    issues: string[];
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function forceStreamingEngine(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('audioEngineType', 'streaming');
    } catch {}
  });
}

async function navigateToChannelsIfNeeded(page: Page): Promise<void> {
  const channelCard = page.locator('[data-channel-id]').first();
  const isChannelVisible = await channelCard.isVisible({ timeout: 2000 }).catch(() => false);
  if (isChannelVisible) return;

  const channelsButton = page.locator('button:has-text("Channels")').first();
  const isVisible = await channelsButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (isVisible) {
    await channelsButton.click({ force: true });
  }

  await channelCard.waitFor({ state: 'visible', timeout: 20000 });
}

/**
 * Wait for audio to be playing with retry logic for headless Chromium reliability.
 * 
 * This function:
 * 1. Checks for error modals and fails early if detected
 * 2. Retries clicking the play button if audio doesn't start
 * 3. Verifies both the UI state (data-playing) and actual audio playback
 * 4. Provides detailed diagnostics on failure
 */
async function waitForAudioPlaying(page: Page, timeout = 30000): Promise<void> {
  const MAX_RETRIES = 3;
  // Use shorter per-attempt timeout to allow for retries
  const PER_ATTEMPT_TIMEOUT = Math.min(12000, Math.floor(timeout / 3));
  
  let lastDiagnostics: Record<string, unknown> | null = null;
  
  // Helper to get current diagnostics
  const getDiagnostics = async (): Promise<Record<string, unknown> | null> => {
    try {
      return await page.evaluate(() => {
        const footerBtn = document.querySelector('[data-testid="player-play-pause"]');
        const channelBtn = document.querySelector('[data-testid="channel-play-pause"]');
        const audio = document.querySelector('audio') as HTMLAudioElement | null;
        const errorModal = document.querySelector('[data-testid="playback-loading-modal"]');
        const loadingShimmer = document.querySelector('[data-testid="loading-shimmer"]');
        
        return {
          footerBtnExists: !!footerBtn,
          footerDataPlaying: footerBtn?.getAttribute('data-playing'),
          channelBtnExists: !!channelBtn,
          channelDataPlaying: channelBtn?.getAttribute('data-playing'),
          audioExists: !!audio,
          audioPaused: audio?.paused,
          audioCurrentTime: audio?.currentTime,
          audioSrc: audio?.src?.slice(0, 100),
          audioReadyState: audio?.readyState,
          audioNetworkState: audio?.networkState,
          audioError: audio?.error?.message,
          errorModalVisible: !!errorModal,
          loadingModalVisible: !!loadingShimmer,
        };
      });
    } catch {
      return null;
    }
  };
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Check for error modal before waiting
      const hasErrorModal = await page.evaluate(() => {
        const modal = document.querySelector('[data-testid="playback-loading-modal"]');
        if (!modal) return false;
        const ariaLabel = modal.getAttribute('aria-label');
        return ariaLabel === 'Playback error';
      }).catch(() => false);
      
      if (hasErrorModal) {
        // Dismiss error modal and retry
        console.log(`  [attempt ${attempt}/${MAX_RETRIES}] Error modal detected, dismissing and retrying...`);
        const dismissBtn = page.locator('[data-testid="loading-modal-dismiss-btn"]');
        if (await dismissBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await dismissBtn.click();
          await page.waitForTimeout(500);
        }
        
        // Re-click play button to retry
        await retryPlayClick(page);
        continue;
      }
      
      // Wait for data-playing="true" on the footer play button
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('[data-testid="player-play-pause"]');
          return btn?.getAttribute('data-playing') === 'true';
        },
        { timeout: PER_ATTEMPT_TIMEOUT }
      );
      
      // Wait for audio element to be actually playing
      await page.waitForFunction(
        async () => {
          const audio = document.querySelector('audio') as HTMLAudioElement | null;
          if (!audio) return false;
          if (audio.paused) return false;
          
          const initialTime = audio.currentTime;
          await new Promise(resolve => setTimeout(resolve, 300));
          return audio.currentTime > initialTime;
        },
        { timeout: 10000 }
      );
      
      // Success!
      return;
      
    } catch (err) {
      // Get diagnostics on failure
      lastDiagnostics = await getDiagnostics();
      if (lastDiagnostics) {
        console.log(`  [attempt ${attempt}/${MAX_RETRIES}] Audio not playing. Diagnostics:`, JSON.stringify(lastDiagnostics, null, 2));
      } else {
        console.log(`  [attempt ${attempt}/${MAX_RETRIES}] Audio not playing. (Could not get diagnostics)`);
      }
      
      if (attempt < MAX_RETRIES) {
        console.log(`  [attempt ${attempt}/${MAX_RETRIES}] Retrying...`);
        await retryPlayClick(page);
      } else {
        // Final attempt failed - throw with diagnostics
        throw new Error(
          `Audio failed to start after ${MAX_RETRIES} attempts. ` +
          `Last diagnostics: ${JSON.stringify(lastDiagnostics)}`
        );
      }
    }
  }
}

/**
 * Helper to retry clicking the play button
 */
async function retryPlayClick(page: Page): Promise<void> {
  try {
    // First try the channel play button
    const channelPlayBtn = page.locator('[data-testid="channel-play-pause"]').first();
    if (await channelPlayBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await channelPlayBtn.click({ force: true });
      await page.waitForTimeout(1500);
      return;
    }
    
    // Fallback to footer play button
    const footerPlayBtn = page.locator('[data-testid="player-play-pause"]');
    if (await footerPlayBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await footerPlayBtn.click({ force: true });
      await page.waitForTimeout(1500);
      return;
    }
    
    // If neither visible, wait and hope loading completes
    await page.waitForTimeout(2000);
  } catch {
    // Best effort - continue to next attempt
    await page.waitForTimeout(1000);
  }
}

async function clearTraces(page: Page): Promise<void> {
  await page.evaluate(() => {
    const trace = (window as any).__playbackTrace;
    trace?.clear?.();
    const perf = (window as any).__playerPerf;
    perf?.clear?.();
  });
}

async function getTraces(page: Page): Promise<PlaybackTrace[]> {
  return page.evaluate(() => {
    const trace = (window as any).__playbackTrace;
    return trace?.traces?.() ?? [];
  });
}

async function getTTFAEvents(page: Page): Promise<TTFAEvent[]> {
  return page.evaluate(() => {
    const perf = (window as any).__playerPerf;
    return perf?.events?.() ?? [];
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// [PHASE 4.1] Helper to get the appropriate summary (prefer ttfaWindowSummary)
function getTraceSummary(trace: PlaybackTrace): TraceSummary | undefined {
  return trace.ttfaWindowSummary || trace.summary;
}

// [PHASE 4.1] Helper to get the appropriate events (prefer ttfaWindowEvents)
function getTraceEvents(trace: PlaybackTrace): NetworkEvent[] {
  return trace.ttfaWindowEvents || trace.events || [];
}

function computeBaselineSummary(
  traces: PlaybackTrace[], 
  ttfaEvents: TTFAEvent[]
): BaselineReport['summary'] {
  // TTFA stats from successful events
  const successTTFA = ttfaEvents
    .filter(e => e.success === true && typeof e.ttfaMs === 'number')
    .map(e => e.ttfaMs!);

  const successCount = traces.filter(t => t.outcome?.outcome === 'success').length;
  const failCount = traces.filter(t => t.outcome?.outcome === 'fail').length;

  // By trigger type
  // [PHASE 4.1] Use ttfaWindowSummary for clean TTFA-only metrics
  const byTriggerType: Record<string, { times: number[]; fetches: number[] }> = {};
  for (const trace of traces) {
    const triggerType = trace.meta.triggerType || 'unknown';
    if (!byTriggerType[triggerType]) {
      byTriggerType[triggerType] = { times: [], fetches: [] };
    }
    if (trace.outcome?.ttfaMs) {
      byTriggerType[triggerType].times.push(trace.outcome.ttfaMs);
    }
    const summary = getTraceSummary(trace);
    if (summary?.totalRequests) {
      byTriggerType[triggerType].fetches.push(summary.totalRequests);
    }
  }

  const byTriggerTypeSummary: Record<string, {
    count: number;
    p50Ms: number;
    p95Ms: number;
    avgFetches: number;
  }> = {};

  for (const [type, data] of Object.entries(byTriggerType)) {
    byTriggerTypeSummary[type] = {
      count: data.times.length,
      p50Ms: percentile(data.times, 50),
      p95Ms: percentile(data.times, 95),
      avgFetches: data.fetches.length > 0 
        ? Math.round(data.fetches.reduce((a, b) => a + b, 0) / data.fetches.length)
        : 0,
    };
  }

  // Warning counts
  // [PHASE 4.1] Use ttfaWindowSummary and ttfaWindowEvents for clean TTFA-only analysis
  const warningCounts: Record<string, number> = {};
  for (const trace of traces) {
    const summary = getTraceSummary(trace);
    const events = getTraceEvents(trace);
    
    // Check for duplicate user_preferences
    const userPrefsCount = Object.entries(summary?.byEndpoint || {})
      .filter(([ep]) => ep.includes('user_preferences'))
      .reduce((sum, [, count]) => sum + count, 0);
    if (userPrefsCount > 1) {
      warningCounts['duplicate_user_preferences'] = (warningCounts['duplicate_user_preferences'] || 0) + 1;
    }

    // Check for duplicate slot_strategies
    const slotStratCount = Object.entries(summary?.byEndpoint || {})
      .filter(([ep]) => ep.includes('slot_strategies'))
      .reduce((sum, [, count]) => sum + count, 0);
    if (slotStratCount > 1) {
      warningCounts['duplicate_slot_strategy'] = (warningCounts['duplicate_slot_strategy'] || 0) + 1;
    }

    // Check for audio_tracks select=*
    for (const event of events) {
      if (event.url?.includes('audio_tracks') && event.url.includes('select=*')) {
        warningCounts['audio_tracks_select_all'] = (warningCounts['audio_tracks_select_all'] || 0) + 1;
      }
    }

    // [PHASE 4.7] Check for excessive audio_tracks requests in slot-seq flows
    // After Phase 4.7 batching, slot-seq should have at most 2 audio_tracks requests:
    // 1x genre pool fetch + 1x metadata batch fetch
    const channelName = trace.meta.channelName || '';
    const isSlotSeq = SLOT_SEQUENCER_CHANNELS.some(name => 
      channelName.toLowerCase() === name.toLowerCase()
    );
    if (isSlotSeq) {
      const audioTracksCount = Object.entries(summary?.byEndpoint || {})
        .filter(([ep]) => ep.includes('audio_tracks'))
        .reduce((sum, [, count]) => sum + count, 0);
      if (audioTracksCount > 2) {
        warningCounts['slot_seq_excessive_audio_tracks'] = (warningCounts['slot_seq_excessive_audio_tracks'] || 0) + 1;
      }

      // [PHASE 4.8] Check for duplicate slot config fetches in slot-seq flows
      // After Phase 4.8 deduplication, slot-seq should have at most 1 request per slot table
      const slotDefCount = Object.entries(summary?.byEndpoint || {})
        .filter(([ep]) => ep.includes('slot_definitions'))
        .reduce((sum, [, count]) => sum + count, 0);
      const slotRuleGroupsCount = Object.entries(summary?.byEndpoint || {})
        .filter(([ep]) => ep.includes('slot_rule_groups'))
        .reduce((sum, [, count]) => sum + count, 0);
      const slotBoostsCount = Object.entries(summary?.byEndpoint || {})
        .filter(([ep]) => ep.includes('slot_boosts'))
        .reduce((sum, [, count]) => sum + count, 0);
      
      if (slotDefCount > 1 || slotRuleGroupsCount > 1 || slotBoostsCount > 1) {
        warningCounts['slot_seq_duplicate_slot_config'] = (warningCounts['slot_seq_duplicate_slot_config'] || 0) + 1;
      }
    }

    // Check for analytics before audio
    // Note: PATCH to track_play_events is trackPlayEnd for PREVIOUS track - exclude those
    // Only flag INSERT (POST) to track_play_events or listening_sessions, or update_track calls
    const analyticsEvents = events.filter(e => {
      const pathname = e.pathname || '';
      const method = e.method || '';
      
      // listening_sessions INSERT = new session creation (should be deferred)
      if (pathname.includes('listening_sessions') && method === 'POST') {
        return true;
      }
      
      // track_play_events INSERT = new track start (should be deferred)
      // Exclude PATCH which is trackPlayEnd for previous track (acceptable)
      if (pathname.includes('track_play_events') && method === 'POST') {
        return true;
      }
      
      // update_track_analytics_summary is deferred analytics (should be after audio)
      // But this is called by trackPlayEnd for PREVIOUS track, so exclude it
      // if (pathname.includes('update_track')) {
      //   return true;
      // }
      
      return false;
    });
    if (analyticsEvents.length > 0 && trace.outcome?.outcome === 'success') {
      const ttfaMs = trace.outcome.ttfaMs || 0;
      const startTs = trace.startedAt || 0;
      const earlyAnalytics = analyticsEvents.filter(e => (e.ts - startTs) < ttfaMs);
      if (earlyAnalytics.length > 0) {
        warningCounts['analytics_before_audio'] = (warningCounts['analytics_before_audio'] || 0) + 1;
      }
    }
  }

  // [PHASE 4.1] Use ttfaWindowSummary for clean TTFA-only fetch counts
  const totalFetches = traces.reduce((sum, t) => {
    const summary = getTraceSummary(t);
    return sum + (summary?.totalRequests || 0);
  }, 0);

  // [PHASE 4.4] Compute per-channel-type breakdown (slot sequencer vs admin-curated)
  const slotSeqTraces: { times: number[]; fetches: number[]; names: Set<string> } = { times: [], fetches: [], names: new Set() };
  const adminCuratedTraces: { times: number[]; fetches: number[]; names: Set<string> } = { times: [], fetches: [], names: new Set() };

  for (const trace of traces) {
    const channelName = trace.meta.channelName || '';
    // [PHASE 4.5] Use exact match against canonical list (case-insensitive)
    const isSlotSeq = SLOT_SEQUENCER_CHANNELS.some(name => 
      channelName.toLowerCase() === name.toLowerCase()
    );
    const target = isSlotSeq ? slotSeqTraces : adminCuratedTraces;
    
    if (trace.outcome?.ttfaMs) {
      target.times.push(trace.outcome.ttfaMs);
    }
    const summary = getTraceSummary(trace);
    if (summary?.totalRequests) {
      target.fetches.push(summary.totalRequests);
    }
    if (channelName) {
      target.names.add(channelName);
    }
  }

  const byChannelType = {
    slotSequencer: {
      count: slotSeqTraces.times.length,
      p50Ms: percentile(slotSeqTraces.times, 50),
      p95Ms: percentile(slotSeqTraces.times, 95),
      avgFetches: slotSeqTraces.fetches.length > 0 
        ? Math.round(slotSeqTraces.fetches.reduce((a, b) => a + b, 0) / slotSeqTraces.fetches.length)
        : 0,
      channelNames: Array.from(slotSeqTraces.names),
    },
    adminCurated: {
      count: adminCuratedTraces.times.length,
      p50Ms: percentile(adminCuratedTraces.times, 50),
      p95Ms: percentile(adminCuratedTraces.times, 95),
      avgFetches: adminCuratedTraces.fetches.length > 0 
        ? Math.round(adminCuratedTraces.fetches.reduce((a, b) => a + b, 0) / adminCuratedTraces.fetches.length)
        : 0,
      channelNames: Array.from(adminCuratedTraces.names),
    },
  };

  return {
    traceCount: traces.length,
    successCount,
    failCount,
    ttfa: {
      min: successTTFA.length > 0 ? Math.min(...successTTFA) : 0,
      p50: percentile(successTTFA, 50),
      p95: percentile(successTTFA, 95),
      max: successTTFA.length > 0 ? Math.max(...successTTFA) : 0,
    },
    byTriggerType: byTriggerTypeSummary,
    byChannelType,
    totalFetches,
    avgFetchesPerTrace: traces.length > 0 ? Math.round(totalFetches / traces.length) : 0,
    warnings: Object.entries(warningCounts).map(([type, count]) => ({ type, count })),
  };
}

function computeVerdict(summary: BaselineReport['summary']): BaselineReport['verdict'] {
  const issues: string[] = [];

  // Check TTFA P95
  if (summary.ttfa.p95 > THRESHOLDS.ttfaP95Ms) {
    issues.push(`TTFA P95 (${summary.ttfa.p95}ms) exceeds threshold (${THRESHOLDS.ttfaP95Ms}ms)`);
  }

  // Check avg fetches per trace
  if (summary.avgFetchesPerTrace > THRESHOLDS.maxFetchesPerTrace) {
    issues.push(`Avg fetches per trace (${summary.avgFetchesPerTrace}) exceeds threshold (${THRESHOLDS.maxFetchesPerTrace})`);
  }

  // Check warnings
  for (const warning of summary.warnings) {
    if (warning.type === 'duplicate_user_preferences' && warning.count > THRESHOLDS.maxDuplicateUserPrefs) {
      issues.push(`Duplicate user_preferences detected (${warning.count}x)`);
    }
    if (warning.type === 'duplicate_slot_strategy' && warning.count > THRESHOLDS.maxDuplicateSlotStrategy) {
      issues.push(`Excessive slot_strategy duplicates (${warning.count}x)`);
    }
    if (warning.type === 'audio_tracks_select_all') {
      issues.push(`audio_tracks?select=* detected (${warning.count}x) - should use minimal columns`);
    }
    if (warning.type === 'analytics_before_audio') {
      issues.push(`Analytics fired before first audio (${warning.count}x)`);
    }
  }

  return {
    pass: issues.length === 0,
    issues,
  };
}

function writeBaselineReport(report: BaselineReport): void {
  // Ensure run directory exists
  if (!fs.existsSync(RUN_DIR)) {
    fs.mkdirSync(RUN_DIR, { recursive: true });
  }

  // Write traces
  const tracesPath = path.join(RUN_DIR, 'playback-traces.json');
  fs.writeFileSync(tracesPath, JSON.stringify(report.traces, null, 2));

  // Write TTFA events
  const ttfaPath = path.join(RUN_DIR, 'ttfa-events.json');
  fs.writeFileSync(ttfaPath, JSON.stringify(report.ttfaEvents, null, 2));

  // Write full report
  const reportPath = path.join(RUN_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Write human-readable summary
  const summaryLines = [
    `# Playback Performance Baseline`,
    ``,
    `**Run ID:** ${report.runId}`,
    `**Timestamp:** ${report.timestamp}`,
    ``,
    `## Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Traces | ${report.summary.traceCount} |`,
    `| Successes | ${report.summary.successCount} |`,
    `| Failures | ${report.summary.failCount} |`,
    `| TTFA P50 | ${report.summary.ttfa.p50}ms |`,
    `| TTFA P95 | ${report.summary.ttfa.p95}ms |`,
    `| TTFA Max | ${report.summary.ttfa.max}ms |`,
    `| Avg Fetches/Trace | ${report.summary.avgFetchesPerTrace} |`,
    ``,
    `## By Trigger Type`,
    ``,
    `| Trigger | Count | P50 | P95 | Avg Fetches |`,
    `|---------|-------|-----|-----|-------------|`,
  ];

  for (const [type, data] of Object.entries(report.summary.byTriggerType)) {
    summaryLines.push(`| ${type} | ${data.count} | ${data.p50Ms}ms | ${data.p95Ms}ms | ${data.avgFetches} |`);
  }

  // [PHASE 4.4] Add per-channel-type breakdown
  if (report.summary.byChannelType) {
    summaryLines.push(``);
    summaryLines.push(`## By Channel Type`);
    summaryLines.push(``);
    summaryLines.push(`| Type | Count | P50 | P95 | Avg Fetches | Channels |`);
    summaryLines.push(`|------|-------|-----|-----|-------------|----------|`);
    
    const slotSeq = report.summary.byChannelType.slotSequencer;
    const adminCur = report.summary.byChannelType.adminCurated;
    
    if (slotSeq.count > 0) {
      summaryLines.push(`| Slot Sequencer | ${slotSeq.count} | ${slotSeq.p50Ms}ms | ${slotSeq.p95Ms}ms | ${slotSeq.avgFetches} | ${slotSeq.channelNames.join(', ')} |`);
    }
    if (adminCur.count > 0) {
      summaryLines.push(`| Admin-Curated | ${adminCur.count} | ${adminCur.p50Ms}ms | ${adminCur.p95Ms}ms | ${adminCur.avgFetches} | ${adminCur.channelNames.join(', ')} |`);
    }
  }

  if (report.summary.warnings.length > 0) {
    summaryLines.push(``);
    summaryLines.push(`## Warnings`);
    summaryLines.push(``);
    for (const warning of report.summary.warnings) {
      summaryLines.push(`- ⚠️ ${warning.type}: ${warning.count}x`);
    }
  }

  summaryLines.push(``);
  summaryLines.push(`## Verdict`);
  summaryLines.push(``);
  if (report.verdict.pass) {
    summaryLines.push(`✅ **PASS** - All thresholds met`);
  } else {
    summaryLines.push(`❌ **FAIL** - Issues detected:`);
    for (const issue of report.verdict.issues) {
      summaryLines.push(`- ${issue}`);
    }
  }

  const summaryPath = path.join(RUN_DIR, 'summary.md');
  fs.writeFileSync(summaryPath, summaryLines.join('\n'));

  console.log(`\n📁 Baseline report written to: ${RUN_DIR}`);
  console.log(`   - playback-traces.json (${report.traces.length} traces)`);
  console.log(`   - ttfa-events.json (${report.ttfaEvents.length} events)`);
  console.log(`   - report.json (full report)`);
  console.log(`   - summary.md (human-readable)`);
}

// ============================================================================
// TEST SUITE
// ============================================================================

test.describe('Playback Baseline Generation', () => {
  test.setTimeout(180_000);
  test.skip(!hasTestCredentials, 'Skipping: TEST_USER_EMAIL and TEST_USER_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await forceStreamingEngine(page);
    await page.goto('/', { waitUntil: 'networkidle' });
    await loginAsUser(page);
    await navigateToChannelsIfNeeded(page);
    await page.waitForTimeout(1000);
    await clearTraces(page);
  });

  test('generate baseline: initial play → energy change → channel change → slot-seq channel', async ({ page }) => {
    const channelCards = page.locator('[data-channel-id]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(1);

    console.log('\n=== BASELINE GENERATION ===\n');

    // [PHASE 4.5] Helper to find a slot sequencer channel by name
    // Uses PREFERRED_SLOT_SEQ_CHANNELS for reliable testing
    const findSlotSequencerChannel = async () => {
      for (const name of PREFERRED_SLOT_SEQ_CHANNELS) {
        const card = page.locator('[data-channel-id]', { hasText: name }).first();
        if (await card.isVisible({ timeout: 500 }).catch(() => false)) {
          // [PHASE 4.5] Guardrail: Verify this channel is in canonical slot-seq list
          const isInCanonicalList = SLOT_SEQUENCER_CHANNELS.some(
            canonical => canonical.toLowerCase() === name.toLowerCase()
          );
          if (!isInCanonicalList) {
            throw new Error(`GUARDRAIL FAIL: "${name}" is not in SLOT_SEQUENCER_CHANNELS canonical list`);
          }
          return { card, name };
        }
      }
      return null;
    };
    
    // [PHASE 4.5] Helper to check if a channel name is a slot sequencer
    const isSlotSequencerChannel = (channelName: string): boolean => {
      return SLOT_SEQUENCER_CHANNELS.some(
        name => channelName.toLowerCase() === name.toLowerCase()
      );
    };

    // -------------------------------------------------------------------------
    // FLOW 1: Initial Play (first channel - likely admin-curated)
    // -------------------------------------------------------------------------
    console.log('FLOW 1: Initial Play...');
    
    // Click first channel card to expand it
    const firstChannel = channelCards.first();
    await firstChannel.click();
    
    // Wait for energy selector to be visible
    const energySelector = page.locator('[data-testid="energy-selector"]');
    await energySelector.waitFor({ state: 'visible', timeout: 10000 });
    
    // Wait a moment for the channel card to fully expand
    await page.waitForTimeout(500);
    
    // Click play button with force to ensure it registers
    const playButton = page.locator('[data-testid="channel-play-pause"]').first();
    await playButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Ensure the play button is clickable (not covered by loading modal)
    await playButton.click({ force: true });
    
    // Wait a moment for playback to initiate
    await page.waitForTimeout(1000);
    
    // Wait for audio to be playing
    await waitForAudioPlaying(page, 45000);
    console.log('  ✓ Initial play complete');

    // Wait for trace to settle
    await page.waitForTimeout(2000);

    // -------------------------------------------------------------------------
    // FLOW 2: Energy Change
    // -------------------------------------------------------------------------
    console.log('FLOW 2: Energy Change...');
    
    // Find a different energy level to click
    const energyLevels = ['low', 'medium', 'high'];
    let clicked = false;
    
    for (const level of energyLevels) {
      const energyButton = page.locator(`[data-testid="energy-${level}"]`);
      const isVisible = await energyButton.isVisible({ timeout: 1000 }).catch(() => false);
      
      if (isVisible) {
        const isActive = await energyButton.getAttribute('data-active').catch(() => null);
        if (isActive !== 'true') {
          await energyButton.click();
          clicked = true;
          break;
        }
      }
    }
    
    if (clicked) {
      await waitForAudioPlaying(page, 45000);
      console.log('  ✓ Energy change complete');
    } else {
      console.log('  ⚠ Could not find inactive energy level');
    }

    // Wait for trace to settle
    await page.waitForTimeout(2000);

    // -------------------------------------------------------------------------
    // FLOW 3: Channel Change
    // -------------------------------------------------------------------------
    console.log('FLOW 3: Channel Change...');
    
    // Click on a different channel
    const secondChannel = channelCards.nth(1);
    await secondChannel.click();
    
    // Wait for audio - channel click should auto-start since audio was already playing
    await waitForAudioPlaying(page, 45000);
    console.log('  ✓ Channel change complete');

    // Wait for trace to settle
    await page.waitForTimeout(2000);

    // -------------------------------------------------------------------------
    // FLOW 4: Slot Sequencer Channel (explicit)
    // -------------------------------------------------------------------------
    console.log('FLOW 4: Slot Sequencer Channel...');
    
    const slotSeqChannel = await findSlotSequencerChannel();
    if (slotSeqChannel) {
      // [PHASE 4.5] Guardrail: Assert Flow 4 uses a canonical slot-seq channel
      expect(
        isSlotSequencerChannel(slotSeqChannel.name),
        `Flow 4 channel "${slotSeqChannel.name}" must be in SLOT_SEQUENCER_CHANNELS canonical list`
      ).toBe(true);
      
      await slotSeqChannel.card.click();
      await waitForAudioPlaying(page, 45000);
      console.log(`  ✓ Slot sequencer channel "${slotSeqChannel.name}" complete`);
    } else {
      console.log('  ⚠ No slot sequencer channel found in preferred list: ' + PREFERRED_SLOT_SEQ_CHANNELS.join(', '));
    }

    // Wait for final trace to settle
    await page.waitForTimeout(3000);

    // -------------------------------------------------------------------------
    // EXPORT DATA
    // -------------------------------------------------------------------------
    console.log('\nExporting traces...');
    
    const traces = await getTraces(page);
    const ttfaEvents = await getTTFAEvents(page);

    console.log(`  Captured ${traces.length} traces`);
    console.log(`  Captured ${ttfaEvents.length} TTFA events`);

    // Compute summary and verdict
    const summary = computeBaselineSummary(traces, ttfaEvents);
    const verdict = computeVerdict(summary);

    const report: BaselineReport = {
      runId: RUN_TIMESTAMP,
      timestamp: new Date().toISOString(),
      traces,
      ttfaEvents,
      summary,
      thresholds: THRESHOLDS,
      verdict,
    };

    // Write report
    writeBaselineReport(report);

    // Print summary to console
    console.log('\n=== BASELINE SUMMARY ===\n');
    console.log(`TTFA P50: ${summary.ttfa.p50}ms`);
    console.log(`TTFA P95: ${summary.ttfa.p95}ms`);
    console.log(`TTFA Max: ${summary.ttfa.max}ms`);
    console.log(`Avg Fetches/Trace: ${summary.avgFetchesPerTrace}`);
    console.log(`\nBy Trigger Type:`);
    for (const [type, data] of Object.entries(summary.byTriggerType)) {
      console.log(`  ${type}: count=${data.count}, p50=${data.p50Ms}ms, p95=${data.p95Ms}ms`);
    }
    
    if (summary.warnings.length > 0) {
      console.log(`\nWarnings:`);
      for (const warning of summary.warnings) {
        console.log(`  ⚠️ ${warning.type}: ${warning.count}x`);
      }
    }

    console.log(`\nVerdict: ${verdict.pass ? '✅ PASS' : '❌ FAIL'}`);
    if (!verdict.pass) {
      for (const issue of verdict.issues) {
        console.log(`  - ${issue}`);
      }
    }

    // Assertions for CI
    expect(traces.length).toBeGreaterThan(0);
    expect(summary.successCount).toBeGreaterThan(0);
    
    // [PHASE 4.5] Guardrail assertions for channel classification correctness
    if (summary.byChannelType) {
      const slotSeqChannels = summary.byChannelType.slotSequencer.channelNames;
      const adminCuratedChannels = summary.byChannelType.adminCurated.channelNames;
      
      // Guardrail 1: NatureBeat must NOT be in slot sequencer list
      expect(
        slotSeqChannels.some(name => name.toLowerCase() === 'naturebeat'),
        'GUARDRAIL: NatureBeat was incorrectly classified as slot sequencer'
      ).toBe(false);
      
      // Guardrail 2: All slot-seq channels must be in canonical list
      for (const channelName of slotSeqChannels) {
        const isCanonical = SLOT_SEQUENCER_CHANNELS.some(
          canonical => canonical.toLowerCase() === channelName.toLowerCase()
        );
        expect(
          isCanonical,
          `GUARDRAIL: "${channelName}" in slot-seq report but not in SLOT_SEQUENCER_CHANNELS canonical list`
        ).toBe(true);
      }
      
      // Guardrail 3: No canonical slot-seq channels should appear in admin-curated list
      for (const channelName of adminCuratedChannels) {
        const isSlotSeq = SLOT_SEQUENCER_CHANNELS.some(
          canonical => canonical.toLowerCase() === channelName.toLowerCase()
        );
        expect(
          isSlotSeq,
          `GUARDRAIL: "${channelName}" is a slot-seq channel but was classified as admin-curated`
        ).toBe(false);
      }
      
      console.log('\n✅ Channel classification guardrails passed');
      console.log(`   Slot Sequencer: ${slotSeqChannels.join(', ') || '(none)'}`);
      console.log(`   Admin-Curated: ${adminCuratedChannels.join(', ') || '(none)'}`);
    }
  });
});

