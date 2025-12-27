#!/usr/bin/env node
/**
 * HAR File Analyzer for Supabase Startup Deduplication
 * Analyzes before/after HAR files to measure caching effectiveness
 */

const fs = require('fs');
const path = require('path');

// Parse HAR file
function parseHar(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

// Extract Supabase REST calls
function extractSupabaseCalls(har) {
  const entries = har.log.entries || [];
  const supabaseCalls = [];
  
  for (const entry of entries) {
    const url = entry.request?.url || '';
    if (url.includes('supabase.co/rest/v1/')) {
      // Extract table and query
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/rest/v1/');
      const tableAndQuery = pathParts[1] || '';
      const table = tableAndQuery.split('?')[0];
      const query = urlObj.search;
      
      supabaseCalls.push({
        fullUrl: url,
        table,
        query,
        method: entry.request?.method || 'GET',
        status: entry.response?.status || 0,
        size: entry.response?.content?.size || 0,
        time: entry.time || 0,
      });
    }
  }
  
  return supabaseCalls;
}

// Group and count calls
function countCalls(calls) {
  const counts = {};
  
  for (const call of calls) {
    // Create a key from table + simplified query
    const queryKey = call.query.replace(/%2C/g, ',').replace(/%3D/g, '=');
    const key = `${call.method} ${call.table}${queryKey}`;
    
    if (!counts[key]) {
      counts[key] = { count: 0, table: call.table, method: call.method, query: queryKey };
    }
    counts[key].count++;
  }
  
  return counts;
}

// Get key dataset counts
function getKeyDatasetCounts(counts) {
  const datasets = {
    system_preferences: 0,
    image_sets: 0,
    audio_channels: 0,
    user_preferences: 0,
    user_profiles: 0,
    'audio_tracks?select=*': 0,
  };
  
  for (const [key, value] of Object.entries(counts)) {
    if (value.table === 'system_preferences') {
      datasets.system_preferences += value.count;
    } else if (value.table === 'image_sets') {
      datasets.image_sets += value.count;
    } else if (value.table === 'audio_channels') {
      datasets.audio_channels += value.count;
    } else if (value.table === 'user_preferences' && value.method === 'GET') {
      datasets.user_preferences += value.count;
    } else if (value.table === 'user_profiles') {
      datasets.user_profiles += value.count;
    } else if (value.table === 'audio_tracks' && key.includes('select=*') && !key.includes('track_id=in') && !key.includes('id=eq')) {
      datasets['audio_tracks?select=*'] += value.count;
    }
  }
  
  return datasets;
}

// Find duplicates
function findDuplicates(counts) {
  return Object.entries(counts)
    .filter(([_, v]) => v.count > 1)
    .sort((a, b) => b[1].count - a[1].count);
}

// Extract non-Supabase bottlenecks
function extractBottlenecks(har) {
  const entries = har.log.entries || [];
  const bottlenecks = {
    largeBundles: [],
    fonts: [],
    images: [],
    thirdParty: [],
  };
  
  for (const entry of entries) {
    const url = entry.request?.url || '';
    const size = entry.response?.content?.size || 0;
    const time = entry.time || 0;
    const mimeType = entry.response?.content?.mimeType || '';
    
    // Large JS bundles (> 100KB)
    if ((mimeType.includes('javascript') || url.endsWith('.js')) && size > 100000) {
      const filename = url.split('/').pop()?.split('?')[0] || url;
      bottlenecks.largeBundles.push({ filename, size: Math.round(size / 1024), time: Math.round(time) });
    }
    
    // Fonts
    if (mimeType.includes('font') || url.includes('.woff') || url.includes('.ttf')) {
      const filename = url.split('/').pop()?.split('?')[0] || url;
      bottlenecks.fonts.push({ filename, size: Math.round(size / 1024), time: Math.round(time) });
    }
    
    // Large images (> 50KB)
    if (mimeType.includes('image') && size > 50000) {
      const filename = url.split('/').pop()?.split('?')[0] || url;
      bottlenecks.images.push({ filename, size: Math.round(size / 1024), time: Math.round(time) });
    }
    
    // Third-party calls
    if (!url.includes('localhost') && !url.includes('supabase.co') && !url.includes('127.0.0.1')) {
      const domain = new URL(url).hostname;
      if (!bottlenecks.thirdParty.find(t => t.domain === domain)) {
        bottlenecks.thirdParty.push({ domain, time: Math.round(time) });
      }
    }
  }
  
  // Sort by size
  bottlenecks.largeBundles.sort((a, b) => b.size - a.size);
  bottlenecks.images.sort((a, b) => b.size - a.size);
  
  return bottlenecks;
}

// Format report
function formatReport(name, counts, duplicates, keyDatasets) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${name.toUpperCase()} REPORT`);
  console.log('='.repeat(60));
  
  console.log(`\nTotal unique Supabase endpoints: ${Object.keys(counts).length}`);
  console.log(`Total Supabase requests: ${Object.values(counts).reduce((sum, v) => sum + v.count, 0)}`);
  console.log(`Endpoints with duplicates: ${duplicates.length}`);
  
  if (duplicates.length > 0) {
    console.log('\nTop 10 Most Duplicated Endpoints:');
    console.log('-'.repeat(50));
    duplicates.slice(0, 10).forEach(([key, value], i) => {
      console.log(`${i + 1}. [${value.count}x] ${key.substring(0, 80)}${key.length > 80 ? '...' : ''}`);
    });
  }
  
  console.log('\nKey Dataset Counts:');
  console.log('-'.repeat(50));
  for (const [dataset, count] of Object.entries(keyDatasets)) {
    const status = count <= 1 ? '✅' : '❌';
    console.log(`${status} ${dataset}: ${count}`);
  }
  
  return keyDatasets;
}

// Main
function main() {
  const beforePath = path.join(__dirname, 'startup_before.har');
  const afterPath = path.join(__dirname, 'startup_after.har');
  
  console.log('Parsing HAR files...');
  
  const beforeHar = parseHar(beforePath);
  const afterHar = parseHar(afterPath);
  
  // BEFORE analysis
  const beforeCalls = extractSupabaseCalls(beforeHar);
  const beforeCounts = countCalls(beforeCalls);
  const beforeDuplicates = findDuplicates(beforeCounts);
  const beforeKeyDatasets = getKeyDatasetCounts(beforeCounts);
  formatReport('BEFORE', beforeCounts, beforeDuplicates, beforeKeyDatasets);
  
  // AFTER analysis
  const afterCalls = extractSupabaseCalls(afterHar);
  const afterCounts = countCalls(afterCalls);
  const afterDuplicates = findDuplicates(afterCounts);
  const afterKeyDatasets = getKeyDatasetCounts(afterCounts);
  formatReport('AFTER', afterCounts, afterDuplicates, afterKeyDatasets);
  
  // Comparison
  console.log(`\n${'='.repeat(60)}`);
  console.log('BEFORE vs AFTER COMPARISON');
  console.log('='.repeat(60));
  console.log('\n| Dataset                | Before | After | Change |');
  console.log('|------------------------|--------|-------|--------|');
  
  let allEffective = true;
  for (const dataset of Object.keys(beforeKeyDatasets)) {
    const before = beforeKeyDatasets[dataset];
    const after = afterKeyDatasets[dataset];
    const change = after - before;
    const changeStr = change === 0 ? '=' : (change > 0 ? `+${change}` : `${change}`);
    console.log(`| ${dataset.padEnd(22)} | ${String(before).padEnd(6)} | ${String(after).padEnd(5)} | ${changeStr.padEnd(6)} |`);
    if (after > 1) allEffective = false;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`VERDICT: ${allEffective ? '✅ EFFECTIVE' : '❌ NOT EFFECTIVE'}`);
  console.log('='.repeat(60));
  console.log(allEffective 
    ? 'All key datasets are fetched at most once per hard reload.'
    : 'Some key datasets are still being fetched multiple times.');
  
  // Bottlenecks (from AFTER file, as that's the current state)
  console.log(`\n${'='.repeat(60)}`);
  console.log('OTHER STARTUP BOTTLENECKS (from AFTER)');
  console.log('='.repeat(60));
  
  const bottlenecks = extractBottlenecks(afterHar);
  
  if (bottlenecks.largeBundles.length > 0) {
    console.log('\nLarge JS Bundles (>100KB):');
    bottlenecks.largeBundles.slice(0, 5).forEach(b => {
      console.log(`  • ${b.filename}: ${b.size}KB (${b.time}ms)`);
    });
  } else {
    console.log('\nNo large JS bundles detected.');
  }
  
  if (bottlenecks.fonts.length > 0) {
    console.log('\nFonts loaded:');
    bottlenecks.fonts.slice(0, 5).forEach(f => {
      console.log(`  • ${f.filename}: ${f.size}KB (${f.time}ms)`);
    });
  }
  
  if (bottlenecks.images.length > 0) {
    console.log('\nLarge Images (>50KB):');
    bottlenecks.images.slice(0, 5).forEach(img => {
      console.log(`  • ${img.filename}: ${img.size}KB (${img.time}ms)`);
    });
  }
  
  if (bottlenecks.thirdParty.length > 0) {
    console.log('\nThird-party domains:');
    bottlenecks.thirdParty.slice(0, 10).forEach(t => {
      console.log(`  • ${t.domain} (${t.time}ms)`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
}

main();

