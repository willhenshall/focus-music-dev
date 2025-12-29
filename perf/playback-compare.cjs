#!/usr/bin/env node
/**
 * Playback Performance Comparison CLI
 * 
 * Compares two baseline runs and produces a detailed diff report.
 * 
 * Usage:
 *   node perf/playback-compare.cjs --base perf/runs/<id1> --target perf/runs/<id2>
 *   npm run playback:compare -- --base perf/runs/2024-01-01_12-00-00 --target perf/runs/2024-01-02_12-00-00
 * 
 * Output:
 *   - Console summary
 *   - comparison.md (markdown report for PR comments)
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
// HELPERS
// ============================================================================

function formatMs(ms) {
  if (ms === undefined || ms === null || isNaN(ms)) return 'N/A';
  return `${Math.round(ms)}ms`;
}

function formatDiff(before, after, unit = 'ms', lowerIsBetter = true) {
  if (before === undefined || after === undefined) return 'N/A';
  
  const diff = after - before;
  const pctChange = before !== 0 ? ((diff / before) * 100) : 0;
  
  let color;
  let arrow;
  
  if (Math.abs(pctChange) < 5) {
    color = colors.gray;
    arrow = '→';
  } else if ((lowerIsBetter && diff < 0) || (!lowerIsBetter && diff > 0)) {
    color = colors.green;
    arrow = '↓';
  } else {
    color = colors.red;
    arrow = '↑';
  }
  
  const sign = diff > 0 ? '+' : '';
  return `${color}${arrow} ${sign}${Math.round(diff)}${unit} (${sign}${pctChange.toFixed(1)}%)${colors.reset}`;
}

function formatDiffMd(before, after, unit = 'ms', lowerIsBetter = true) {
  if (before === undefined || after === undefined) return 'N/A';
  
  const diff = after - before;
  const pctChange = before !== 0 ? ((diff / before) * 100) : 0;
  
  let emoji;
  
  if (Math.abs(pctChange) < 5) {
    emoji = '➡️';
  } else if ((lowerIsBetter && diff < 0) || (!lowerIsBetter && diff > 0)) {
    emoji = '🟢';
  } else {
    emoji = '🔴';
  }
  
  const sign = diff > 0 ? '+' : '';
  return `${emoji} ${sign}${Math.round(diff)}${unit} (${sign}${pctChange.toFixed(1)}%)`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { base: null, target: null, output: null };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && args[i + 1]) {
      result.base = args[i + 1];
      i++;
    } else if (args[i] === '--target' && args[i + 1]) {
      result.target = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    }
  }
  
  return result;
}

function loadReport(dir) {
  const reportPath = path.join(dir, 'report.json');
  
  if (!fs.existsSync(reportPath)) {
    throw new Error(`Report not found: ${reportPath}`);
  }
  
  const content = fs.readFileSync(reportPath, 'utf-8');
  return JSON.parse(content);
}

// ============================================================================
// COMPARISON LOGIC
// ============================================================================

function compareReports(base, target) {
  const comparison = {
    base: {
      runId: base.runId,
      timestamp: base.timestamp,
    },
    target: {
      runId: target.runId,
      timestamp: target.timestamp,
    },
    ttfa: {
      p50: {
        before: base.summary.ttfa.p50,
        after: target.summary.ttfa.p50,
      },
      p95: {
        before: base.summary.ttfa.p95,
        after: target.summary.ttfa.p95,
      },
      max: {
        before: base.summary.ttfa.max,
        after: target.summary.ttfa.max,
      },
    },
    fetches: {
      total: {
        before: base.summary.totalFetches,
        after: target.summary.totalFetches,
      },
      avgPerTrace: {
        before: base.summary.avgFetchesPerTrace,
        after: target.summary.avgFetchesPerTrace,
      },
    },
    byTriggerType: {},
    warnings: {
      before: {},
      after: {},
      diff: [],
    },
    verdict: {
      improved: false,
      regressed: false,
      issues: [],
      improvements: [],
    },
  };

  // Compare by trigger type
  const allTriggerTypes = new Set([
    ...Object.keys(base.summary.byTriggerType || {}),
    ...Object.keys(target.summary.byTriggerType || {}),
  ]);

  for (const type of allTriggerTypes) {
    const baseData = base.summary.byTriggerType?.[type] || { p50Ms: 0, p95Ms: 0, avgFetches: 0 };
    const targetData = target.summary.byTriggerType?.[type] || { p50Ms: 0, p95Ms: 0, avgFetches: 0 };
    
    comparison.byTriggerType[type] = {
      p50Ms: { before: baseData.p50Ms, after: targetData.p50Ms },
      p95Ms: { before: baseData.p95Ms, after: targetData.p95Ms },
      avgFetches: { before: baseData.avgFetches, after: targetData.avgFetches },
    };
  }

  // Compare warnings
  for (const warning of base.summary.warnings || []) {
    comparison.warnings.before[warning.type] = warning.count;
  }
  for (const warning of target.summary.warnings || []) {
    comparison.warnings.after[warning.type] = warning.count;
  }

  const allWarningTypes = new Set([
    ...Object.keys(comparison.warnings.before),
    ...Object.keys(comparison.warnings.after),
  ]);

  for (const type of allWarningTypes) {
    const before = comparison.warnings.before[type] || 0;
    const after = comparison.warnings.after[type] || 0;
    
    if (before !== after) {
      comparison.warnings.diff.push({
        type,
        before,
        after,
        change: after - before,
      });
    }
  }

  // Determine verdict
  const ttfaP95Diff = comparison.ttfa.p95.after - comparison.ttfa.p95.before;
  const fetchDiff = comparison.fetches.avgPerTrace.after - comparison.fetches.avgPerTrace.before;

  if (ttfaP95Diff < -100) {
    comparison.verdict.improvements.push(`TTFA P95 improved by ${Math.abs(ttfaP95Diff)}ms`);
    comparison.verdict.improved = true;
  }
  if (ttfaP95Diff > 500) {
    comparison.verdict.issues.push(`TTFA P95 regressed by ${ttfaP95Diff}ms`);
    comparison.verdict.regressed = true;
  }

  if (fetchDiff < -2) {
    comparison.verdict.improvements.push(`Avg fetches/trace reduced by ${Math.abs(fetchDiff)}`);
    comparison.verdict.improved = true;
  }
  if (fetchDiff > 5) {
    comparison.verdict.issues.push(`Avg fetches/trace increased by ${fetchDiff}`);
    comparison.verdict.regressed = true;
  }

  // Warning changes
  for (const w of comparison.warnings.diff) {
    if (w.after === 0 && w.before > 0) {
      comparison.verdict.improvements.push(`Fixed: ${w.type} (was ${w.before}x)`);
      comparison.verdict.improved = true;
    } else if (w.after > w.before) {
      comparison.verdict.issues.push(`New warning: ${w.type} (${w.before} → ${w.after})`);
      comparison.verdict.regressed = true;
    }
  }

  return comparison;
}

// ============================================================================
// OUTPUT
// ============================================================================

function printComparison(comparison) {
  console.log('');
  console.log(`${colors.bright}${colors.cyan}╔══════════════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║              PLAYBACK PERFORMANCE COMPARISON                              ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚══════════════════════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log('');

  console.log(`${colors.bright}Comparing:${colors.reset}`);
  console.log(`  Base:   ${comparison.base.runId} (${comparison.base.timestamp})`);
  console.log(`  Target: ${comparison.target.runId} (${comparison.target.timestamp})`);
  console.log('');

  console.log(`${colors.bright}${colors.blue}TTFA Statistics:${colors.reset}`);
  console.log(`  P50:  ${formatMs(comparison.ttfa.p50.before)} → ${formatMs(comparison.ttfa.p50.after)}  ${formatDiff(comparison.ttfa.p50.before, comparison.ttfa.p50.after)}`);
  console.log(`  P95:  ${formatMs(comparison.ttfa.p95.before)} → ${formatMs(comparison.ttfa.p95.after)}  ${formatDiff(comparison.ttfa.p95.before, comparison.ttfa.p95.after)}`);
  console.log(`  Max:  ${formatMs(comparison.ttfa.max.before)} → ${formatMs(comparison.ttfa.max.after)}  ${formatDiff(comparison.ttfa.max.before, comparison.ttfa.max.after)}`);
  console.log('');

  console.log(`${colors.bright}${colors.blue}Network Requests:${colors.reset}`);
  console.log(`  Total Fetches:      ${comparison.fetches.total.before} → ${comparison.fetches.total.after}  ${formatDiff(comparison.fetches.total.before, comparison.fetches.total.after, '', true)}`);
  console.log(`  Avg Fetches/Trace:  ${comparison.fetches.avgPerTrace.before} → ${comparison.fetches.avgPerTrace.after}  ${formatDiff(comparison.fetches.avgPerTrace.before, comparison.fetches.avgPerTrace.after, '', true)}`);
  console.log('');

  console.log(`${colors.bright}${colors.blue}By Trigger Type:${colors.reset}`);
  for (const [type, data] of Object.entries(comparison.byTriggerType)) {
    console.log(`  ${type}:`);
    console.log(`    P50:         ${formatMs(data.p50Ms.before)} → ${formatMs(data.p50Ms.after)}  ${formatDiff(data.p50Ms.before, data.p50Ms.after)}`);
    console.log(`    P95:         ${formatMs(data.p95Ms.before)} → ${formatMs(data.p95Ms.after)}  ${formatDiff(data.p95Ms.before, data.p95Ms.after)}`);
    console.log(`    Avg Fetches: ${data.avgFetches.before} → ${data.avgFetches.after}  ${formatDiff(data.avgFetches.before, data.avgFetches.after, '', true)}`);
  }
  console.log('');

  if (comparison.warnings.diff.length > 0) {
    console.log(`${colors.bright}${colors.blue}Warning Changes:${colors.reset}`);
    for (const w of comparison.warnings.diff) {
      const arrow = w.change > 0 ? colors.red + '↑' : colors.green + '↓';
      console.log(`  ${arrow} ${w.type}: ${w.before} → ${w.after}${colors.reset}`);
    }
    console.log('');
  }

  console.log(`${colors.bright}Verdict:${colors.reset}`);
  if (comparison.verdict.improvements.length > 0) {
    console.log(`  ${colors.green}Improvements:${colors.reset}`);
    for (const imp of comparison.verdict.improvements) {
      console.log(`    ✅ ${imp}`);
    }
  }
  if (comparison.verdict.issues.length > 0) {
    console.log(`  ${colors.red}Regressions:${colors.reset}`);
    for (const issue of comparison.verdict.issues) {
      console.log(`    ❌ ${issue}`);
    }
  }
  if (!comparison.verdict.improved && !comparison.verdict.regressed) {
    console.log(`  ${colors.gray}No significant changes${colors.reset}`);
  }
  console.log('');
}

function generateMarkdownReport(comparison) {
  const lines = [
    `# Playback Performance Comparison`,
    ``,
    `## Runs`,
    ``,
    `| | Run ID | Timestamp |`,
    `|---|--------|-----------|`,
    `| Base | ${comparison.base.runId} | ${comparison.base.timestamp} |`,
    `| Target | ${comparison.target.runId} | ${comparison.target.timestamp} |`,
    ``,
    `## TTFA Statistics`,
    ``,
    `| Metric | Base | Target | Change |`,
    `|--------|------|--------|--------|`,
    `| P50 | ${formatMs(comparison.ttfa.p50.before)} | ${formatMs(comparison.ttfa.p50.after)} | ${formatDiffMd(comparison.ttfa.p50.before, comparison.ttfa.p50.after)} |`,
    `| P95 | ${formatMs(comparison.ttfa.p95.before)} | ${formatMs(comparison.ttfa.p95.after)} | ${formatDiffMd(comparison.ttfa.p95.before, comparison.ttfa.p95.after)} |`,
    `| Max | ${formatMs(comparison.ttfa.max.before)} | ${formatMs(comparison.ttfa.max.after)} | ${formatDiffMd(comparison.ttfa.max.before, comparison.ttfa.max.after)} |`,
    ``,
    `## Network Requests`,
    ``,
    `| Metric | Base | Target | Change |`,
    `|--------|------|--------|--------|`,
    `| Total Fetches | ${comparison.fetches.total.before} | ${comparison.fetches.total.after} | ${formatDiffMd(comparison.fetches.total.before, comparison.fetches.total.after, '')} |`,
    `| Avg Fetches/Trace | ${comparison.fetches.avgPerTrace.before} | ${comparison.fetches.avgPerTrace.after} | ${formatDiffMd(comparison.fetches.avgPerTrace.before, comparison.fetches.avgPerTrace.after, '')} |`,
    ``,
    `## By Trigger Type`,
    ``,
    `| Trigger | Metric | Base | Target | Change |`,
    `|---------|--------|------|--------|--------|`,
  ];

  for (const [type, data] of Object.entries(comparison.byTriggerType)) {
    lines.push(`| ${type} | P50 | ${formatMs(data.p50Ms.before)} | ${formatMs(data.p50Ms.after)} | ${formatDiffMd(data.p50Ms.before, data.p50Ms.after)} |`);
    lines.push(`| | P95 | ${formatMs(data.p95Ms.before)} | ${formatMs(data.p95Ms.after)} | ${formatDiffMd(data.p95Ms.before, data.p95Ms.after)} |`);
    lines.push(`| | Avg Fetches | ${data.avgFetches.before} | ${data.avgFetches.after} | ${formatDiffMd(data.avgFetches.before, data.avgFetches.after, '')} |`);
  }

  if (comparison.warnings.diff.length > 0) {
    lines.push(``);
    lines.push(`## Warning Changes`);
    lines.push(``);
    lines.push(`| Warning | Base | Target | Change |`);
    lines.push(`|---------|------|--------|--------|`);
    
    for (const w of comparison.warnings.diff) {
      const emoji = w.change > 0 ? '🔴' : '🟢';
      const sign = w.change > 0 ? '+' : '';
      lines.push(`| ${w.type} | ${w.before} | ${w.after} | ${emoji} ${sign}${w.change} |`);
    }
  }

  lines.push(``);
  lines.push(`## Verdict`);
  lines.push(``);

  if (comparison.verdict.improvements.length > 0) {
    lines.push(`### ✅ Improvements`);
    for (const imp of comparison.verdict.improvements) {
      lines.push(`- ${imp}`);
    }
    lines.push(``);
  }

  if (comparison.verdict.issues.length > 0) {
    lines.push(`### ❌ Regressions`);
    for (const issue of comparison.verdict.issues) {
      lines.push(`- ${issue}`);
    }
    lines.push(``);
  }

  if (!comparison.verdict.improved && !comparison.verdict.regressed) {
    lines.push(`➡️ No significant changes detected.`);
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = parseArgs();
  
  if (!args.base || !args.target) {
    console.log('');
    console.log('Usage: node perf/playback-compare.cjs --base <dir> --target <dir>');
    console.log('');
    console.log('Example:');
    console.log('  npm run playback:compare -- --base perf/runs/2024-01-01_12-00-00 --target perf/runs/2024-01-02_12-00-00');
    console.log('');
    console.log('Options:');
    console.log('  --base <dir>     Base run directory (the "before" state)');
    console.log('  --target <dir>   Target run directory (the "after" state)');
    console.log('  --output <dir>   Optional: directory to write comparison report');
    console.log('');
    process.exit(1);
  }

  // Load reports
  let baseReport, targetReport;
  try {
    baseReport = loadReport(args.base);
  } catch (error) {
    console.error(`${colors.red}Error loading base report: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  try {
    targetReport = loadReport(args.target);
  } catch (error) {
    console.error(`${colors.red}Error loading target report: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  // Compare
  const comparison = compareReports(baseReport, targetReport);

  // Print to console
  printComparison(comparison);

  // Generate markdown report
  const markdownReport = generateMarkdownReport(comparison);

  // Write to file
  const outputDir = args.output || args.target;
  const comparisonPath = path.join(outputDir, 'comparison.md');
  fs.writeFileSync(comparisonPath, markdownReport);
  console.log(`📄 Comparison report written to: ${comparisonPath}`);
  console.log('');

  // Exit with error if regressed
  if (comparison.verdict.regressed) {
    process.exit(1);
  }
}

main();

