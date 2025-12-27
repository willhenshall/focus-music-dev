#!/usr/bin/env node
/**
 * TTFA Report CLI
 * 
 * Parses TTFA events from a JSON file and prints summary statistics.
 * 
 * Usage:
 *   node perf/ttfa-report.cjs [path-to-json]
 *   npm run ttfa:report
 * 
 * Default input: perf/ttfa-latest.json (written by E2E tests)
 */

const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Calculate percentile from sorted array.
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Group array items by a key function.
 */
function groupBy(items, keyFn) {
  const groups = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

/**
 * Format milliseconds as a human-readable string.
 */
function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Print a colored status bar.
 */
function printBar(label, value, max, width = 30) {
  const filled = Math.round((value / max) * width);
  const bar = '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(0, width - filled));
  const color = value < max * 0.5 ? colors.green : value < max * 0.8 ? colors.yellow : colors.red;
  console.log(`  ${label.padEnd(20)} ${color}${bar}${colors.reset} ${formatMs(value)}`);
}

/**
 * Parse and analyze TTFA events from JSON.
 */
function analyzeEvents(events) {
  const successEvents = events.filter(e => e.success === true && typeof e.ttfaMs === 'number');
  const failureEvents = events.filter(e => e.success === false);
  
  const ttfaValues = successEvents.map(e => e.ttfaMs).sort((a, b) => a - b);
  
  return {
    total: events.length,
    successes: successEvents.length,
    failures: failureEvents.length,
    successRate: events.length > 0 ? Math.round((successEvents.length / events.length) * 100) : 0,
    p50: percentile(ttfaValues, 50),
    p95: percentile(ttfaValues, 95),
    max: ttfaValues.length > 0 ? ttfaValues[ttfaValues.length - 1] : 0,
    min: ttfaValues.length > 0 ? ttfaValues[0] : 0,
    mean: ttfaValues.length > 0 ? Math.round(ttfaValues.reduce((a, b) => a + b, 0) / ttfaValues.length) : 0,
    byTriggerType: groupBy(successEvents, e => e.triggerType),
    byAudioType: groupBy(successEvents.filter(e => e.audioType), e => e.audioType),
    failureReasons: failureEvents.map(e => e.error).filter(Boolean),
  };
}

/**
 * Print the TTFA report.
 */
function printReport(analysis) {
  console.log('');
  console.log(`${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║                    TTFA Performance Report                    ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  
  // Overview
  console.log(`${colors.bright}Overview:${colors.reset}`);
  console.log(`  Total Events:     ${analysis.total}`);
  console.log(`  Successes:        ${colors.green}${analysis.successes}${colors.reset}`);
  console.log(`  Failures:         ${analysis.failures > 0 ? colors.red : colors.gray}${analysis.failures}${colors.reset}`);
  console.log(`  Success Rate:     ${analysis.successRate >= 95 ? colors.green : colors.yellow}${analysis.successRate}%${colors.reset}`);
  console.log('');
  
  // Timing Statistics
  if (analysis.successes > 0) {
    console.log(`${colors.bright}Timing Statistics:${colors.reset}`);
    console.log(`  Min:              ${formatMs(analysis.min)}`);
    console.log(`  Mean:             ${formatMs(analysis.mean)}`);
    console.log(`  P50 (median):     ${formatMs(analysis.p50)}`);
    console.log(`  P95:              ${formatMs(analysis.p95)}`);
    console.log(`  Max:              ${formatMs(analysis.max)}`);
    console.log('');
    
    // Visual bars
    const maxForBars = Math.max(analysis.max, 8000); // 8s threshold
    console.log(`${colors.bright}Distribution:${colors.reset}`);
    printBar('P50', analysis.p50, maxForBars);
    printBar('P95', analysis.p95, maxForBars);
    printBar('Max', analysis.max, maxForBars);
    console.log(`  ${colors.gray}${'─'.repeat(50)} 8000ms threshold${colors.reset}`);
    console.log('');
  }
  
  // By Trigger Type
  if (Object.keys(analysis.byTriggerType).length > 0) {
    console.log(`${colors.bright}By Trigger Type:${colors.reset}`);
    for (const [triggerType, events] of Object.entries(analysis.byTriggerType)) {
      const values = events.map(e => e.ttfaMs).sort((a, b) => a - b);
      const p50 = percentile(values, 50);
      console.log(`  ${triggerType.padEnd(18)} count: ${events.length}, p50: ${formatMs(p50)}`);
    }
    console.log('');
  }
  
  // By Audio Type
  if (Object.keys(analysis.byAudioType).length > 0) {
    console.log(`${colors.bright}By Audio Type:${colors.reset}`);
    for (const [audioType, events] of Object.entries(analysis.byAudioType)) {
      const values = events.map(e => e.ttfaMs).sort((a, b) => a - b);
      const p50 = percentile(values, 50);
      console.log(`  ${audioType.padEnd(18)} count: ${events.length}, p50: ${formatMs(p50)}`);
    }
    console.log('');
  }
  
  // Failures
  if (analysis.failures > 0) {
    console.log(`${colors.bright}${colors.red}Failures:${colors.reset}`);
    for (const reason of analysis.failureReasons) {
      console.log(`  ${colors.red}• ${reason}${colors.reset}`);
    }
    console.log('');
  }
  
  // Verdict
  console.log(`${colors.bright}Verdict:${colors.reset}`);
  if (analysis.successes === 0) {
    console.log(`  ${colors.red}✗ No successful events${colors.reset}`);
  } else if (analysis.p95 <= 4000) {
    console.log(`  ${colors.green}✓ Excellent performance (P95 ≤ 4s)${colors.reset}`);
  } else if (analysis.p95 <= 6000) {
    console.log(`  ${colors.yellow}○ Good performance (P95 ≤ 6s)${colors.reset}`);
  } else if (analysis.p95 <= 8000) {
    console.log(`  ${colors.yellow}○ Acceptable performance (P95 ≤ 8s)${colors.reset}`);
  } else {
    console.log(`  ${colors.red}✗ Performance needs improvement (P95 > 8s)${colors.reset}`);
  }
  console.log('');
}

/**
 * Main entry point.
 */
function main() {
  // Get input file path
  const inputFile = process.argv[2] || path.join(__dirname, 'ttfa-latest.json');
  
  // Check if file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`${colors.red}Error: File not found: ${inputFile}${colors.reset}`);
    console.log('');
    console.log('Usage: node perf/ttfa-report.cjs [path-to-json]');
    console.log('');
    console.log('Generate TTFA data by running:');
    console.log('  npx playwright test ttfa-metrics.spec.ts');
    console.log('');
    process.exit(1);
  }
  
  // Read and parse JSON
  let events;
  try {
    const content = fs.readFileSync(inputFile, 'utf-8');
    events = JSON.parse(content);
    
    if (!Array.isArray(events)) {
      throw new Error('Expected an array of events');
    }
  } catch (error) {
    console.error(`${colors.red}Error parsing JSON: ${error.message}${colors.reset}`);
    process.exit(1);
  }
  
  // Check for empty data
  if (events.length === 0) {
    console.log(`${colors.yellow}No TTFA events found in ${inputFile}${colors.reset}`);
    process.exit(0);
  }
  
  // Analyze and print report
  console.log(`${colors.gray}Reading: ${inputFile}${colors.reset}`);
  const analysis = analyzeEvents(events);
  printReport(analysis);
}

main();

