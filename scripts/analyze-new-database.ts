import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, anonKey);

interface DiagnosticResult {
  section: string;
  status: 'OK' | 'WARNING' | 'ERROR';
  message: string;
  details?: any;
}

const results: DiagnosticResult[] = [];

function logResult(section: string, status: 'OK' | 'WARNING' | 'ERROR', message: string, details?: any) {
  results.push({ section, status, message, details });
  const emoji = status === 'OK' ? '✓' : status === 'WARNING' ? '⚠️' : '❌';
  console.log(`${emoji} [${section}] ${message}`);
  if (details && Object.keys(details).length > 0) {
    console.log('   Details:', JSON.stringify(details, null, 2));
  }
}

async function getTableCount(tableName: string): Promise<number> {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`   Error counting ${tableName}:`, error.message);
    return -1;
  }
  return count || 0;
}

async function analyzeSchema() {
  console.log('\n=== SCHEMA ANALYSIS ===\n');

  const tables = [
    'audio_channels',
    'audio_tracks',
    'slot_strategies',
    'slot_definitions',
    'slot_boosts',
    'slot_rule_groups',
    'slot_rules',
    'saved_slot_sequences',
    'user_playback_state'
  ];

  const tableCounts: Record<string, number> = {};

  for (const table of tables) {
    const count = await getTableCount(table);
    tableCounts[table] = count;

    if (count === -1) {
      logResult('Schema', 'ERROR', `Table '${table}' is not accessible or doesn't exist`);
    } else if (count === 0) {
      logResult('Schema', 'WARNING', `Table '${table}' exists but is EMPTY (0 rows)`);
    } else {
      logResult('Schema', 'OK', `Table '${table}' has ${count} rows`);
    }
  }

  return tableCounts;
}

async function analyzeChannels() {
  console.log('\n=== CHANNEL CONFIGURATION ANALYSIS ===\n');

  const { data: channels, error } = await supabase
    .from('audio_channels')
    .select('id, channel_number, channel_name, playlist_strategy');

  if (error) {
    logResult('Channels', 'ERROR', `Failed to fetch channels: ${error.message}`);
    return { slotChannels: [], allChannels: [] };
  }

  if (!channels) {
    logResult('Channels', 'ERROR', 'No channels found in database');
    return { slotChannels: [], allChannels: [] };
  }

  logResult('Channels', 'OK', `Found ${channels.length} total channels`);

  const slotChannels = channels.filter(ch => {
    const ps = ch.playlist_strategy;
    return ps && (
      ps.low?.strategy === 'slot_based' ||
      ps.medium?.strategy === 'slot_based' ||
      ps.high?.strategy === 'slot_based'
    );
  });

  if (slotChannels.length === 0) {
    logResult('Channels', 'WARNING', 'NO channels are configured to use slot-based strategy');
  } else {
    logResult('Channels', 'OK',
      `${slotChannels.length} channels use slot-based strategy`,
      {
        channels: slotChannels.map(ch => ({
          number: ch.channel_number,
          name: ch.channel_name,
          tiers: {
            low: ch.playlist_strategy?.low?.strategy,
            medium: ch.playlist_strategy?.medium?.strategy,
            high: ch.playlist_strategy?.high?.strategy
          }
        }))
      }
    );
  }

  return { slotChannels, allChannels: channels };
}

async function analyzeStrategies(slotChannels: any[]) {
  console.log('\n=== SLOT STRATEGY DATA ANALYSIS ===\n');

  if (slotChannels.length === 0) {
    logResult('Strategies', 'WARNING', 'No slot-based channels to analyze');
    return { strategies: [] };
  }

  const { data: strategies, error } = await supabase
    .from('slot_strategies')
    .select('*');

  if (error) {
    logResult('Strategies', 'ERROR', `Failed to fetch strategies: ${error.message}`);
    return { strategies: [] };
  }

  if (!strategies || strategies.length === 0) {
    logResult('Strategies', 'ERROR', 'CRITICAL: No slot_strategies records found in database!');
    logResult('Strategies', 'ERROR', 'This is why slot-based channels cannot play music');
    return { strategies: [] };
  }

  logResult('Strategies', 'OK', `Found ${strategies.length} strategy records`);

  const strategiesByChannel = strategies.reduce((acc: any, s: any) => {
    if (!acc[s.channel_id]) acc[s.channel_id] = [];
    acc[s.channel_id].push(s);
    return acc;
  }, {});

  for (const ch of slotChannels) {
    const channelStrategies = strategiesByChannel[ch.id] || [];
    const tiers = ['low', 'medium', 'high'].filter(tier =>
      ch.playlist_strategy?.[tier]?.strategy === 'slot_based'
    );

    if (channelStrategies.length === 0) {
      logResult('Strategies', 'ERROR',
        `Channel #${ch.channel_number} "${ch.channel_name}" has NO strategies despite being configured for slot-based playback`
      );
    } else if (channelStrategies.length < tiers.length) {
      logResult('Strategies', 'WARNING',
        `Channel #${ch.channel_number} "${ch.channel_name}" needs ${tiers.length} strategies but only has ${channelStrategies.length}`,
        { needed: tiers, found: channelStrategies.map((s: any) => s.energy_tier) }
      );
    } else {
      logResult('Strategies', 'OK',
        `Channel #${ch.channel_number} "${ch.channel_name}" has ${channelStrategies.length} strategies`
      );
    }
  }

  return { strategies };
}

async function analyzeStrategyChildTables(strategies: any[]) {
  console.log('\n=== SLOT STRATEGY CHILD TABLES ANALYSIS ===\n');

  if (strategies.length === 0) {
    logResult('Child Tables', 'ERROR', 'Cannot analyze child tables - no strategies found');
    return;
  }

  for (const strategy of strategies.slice(0, 5)) {
    console.log(`\nAnalyzing strategy: ${strategy.name} (${strategy.energy_tier})`);

    const { data: definitions } = await supabase
      .from('slot_definitions')
      .select('*')
      .eq('strategy_id', strategy.id);

    const defCount = definitions?.length || 0;
    const expectedSlots = strategy.num_slots || 20;

    if (defCount === 0) {
      logResult('Definitions', 'ERROR',
        `Strategy ${strategy.id} has NO slot_definitions (expected ${expectedSlots})`,
        { strategy: strategy.name, tier: strategy.energy_tier }
      );
    } else if (defCount < expectedSlots) {
      logResult('Definitions', 'WARNING',
        `Strategy ${strategy.id} has ${defCount} definitions but expects ${expectedSlots}`,
        { strategy: strategy.name, tier: strategy.energy_tier }
      );
    } else {
      logResult('Definitions', 'OK',
        `Strategy ${strategy.id} has ${defCount} slot definitions`
      );
    }

    const { data: boosts } = await supabase
      .from('slot_boosts')
      .select('*')
      .eq('strategy_id', strategy.id);

    const boostCount = boosts?.length || 0;

    if (boostCount === 0) {
      logResult('Boosts', 'WARNING',
        `Strategy ${strategy.id} has NO slot_boosts (will use defaults)`,
        { strategy: strategy.name, tier: strategy.energy_tier }
      );
    } else {
      logResult('Boosts', 'OK',
        `Strategy ${strategy.id} has ${boostCount} boost configurations`
      );
    }

    const { data: ruleGroups } = await supabase
      .from('slot_rule_groups')
      .select('*')
      .eq('strategy_id', strategy.id);

    const groupCount = ruleGroups?.length || 0;

    if (groupCount === 0) {
      logResult('Rules', 'OK',
        `Strategy ${strategy.id} has no rule groups (no filtering applied)`
      );
    } else {
      logResult('Rules', 'OK',
        `Strategy ${strategy.id} has ${groupCount} rule groups`
      );

      for (const group of ruleGroups) {
        const { data: rules } = await supabase
          .from('slot_rules')
          .select('*')
          .eq('group_id', group.id);

        const ruleCount = rules?.length || 0;
        logResult('Rules', ruleCount > 0 ? 'OK' : 'WARNING',
          `Rule group ${group.id} has ${ruleCount} rules`
        );
      }
    }
  }
}

async function analyzeAudioTracks() {
  console.log('\n=== AUDIO TRACKS METADATA ANALYSIS ===\n');

  const { data: tracks } = await supabase
    .from('audio_tracks')
    .select('id, metadata, speed, intensity, brightness, complexity, valence, arousal, tempo')
    .limit(5);

  if (!tracks || tracks.length === 0) {
    logResult('Tracks', 'ERROR', 'No audio tracks found in database');
    return;
  }

  const fields = ['speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'tempo'];
  let totalFieldsPopulated = 0;
  let totalFieldsPossible = 0;

  for (const track of tracks) {
    for (const field of fields) {
      totalFieldsPossible++;
      if (track[field] !== null && track[field] !== undefined) {
        totalFieldsPopulated++;
      }
    }
  }

  const percentPopulated = (totalFieldsPopulated / totalFieldsPossible) * 100;

  if (percentPopulated < 50) {
    logResult('Tracks', 'ERROR',
      `Only ${percentPopulated.toFixed(1)}% of required metadata fields are populated`,
      { fieldsPopulated: totalFieldsPopulated, fieldsPossible: totalFieldsPossible }
    );
  } else if (percentPopulated < 90) {
    logResult('Tracks', 'WARNING',
      `${percentPopulated.toFixed(1)}% of required metadata fields are populated`,
      { fieldsPopulated: totalFieldsPopulated, fieldsPossible: totalFieldsPossible }
    );
  } else {
    logResult('Tracks', 'OK',
      `${percentPopulated.toFixed(1)}% of required metadata fields are populated`
    );
  }
}

async function generateReport() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                  DIAGNOSTIC SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const errors = results.filter(r => r.status === 'ERROR');
  const warnings = results.filter(r => r.status === 'WARNING');
  const ok = results.filter(r => r.status === 'OK');

  console.log(`Total Checks: ${results.length}`);
  console.log(`✓ Passed: ${ok.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log('');

  if (errors.length > 0) {
    console.log('═══ CRITICAL ERRORS ═══\n');
    errors.forEach(e => {
      console.log(`❌ [${e.section}] ${e.message}`);
    });
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('═══ WARNINGS ═══\n');
    warnings.forEach(w => {
      console.log(`⚠️  [${w.section}] ${w.message}`);
    });
    console.log('');
  }

  console.log('═══ ROOT CAUSE ANALYSIS ═══\n');

  const hasEmptySlotDefinitions = errors.some(e =>
    e.message.includes('NO slot_definitions') || e.message.includes('slot_definitions')
  );
  const hasNoStrategies = errors.some(e => e.message.includes('No slot_strategies'));
  const hasEmptyChildTables = errors.some(e => e.message.includes('Definitions') || e.message.includes('Boosts'));

  if (hasNoStrategies) {
    console.log('🔍 PRIMARY ISSUE: The slot_strategies table is completely empty.');
    console.log('   Without parent strategy records, the system has nothing to configure.');
    console.log('');
  }

  if (hasEmptySlotDefinitions || hasEmptyChildTables) {
    console.log('🔍 PRIMARY ISSUE: Slot strategy child tables are missing critical data.');
    console.log('');
    console.log('   The slot sequencing system requires 5 interconnected tables:');
    console.log('   1. slot_strategies (parent) - PRESENT');
    console.log('   2. slot_definitions - MISSING OR INCOMPLETE');
    console.log('   3. slot_boosts - MISSING OR INCOMPLETE');
    console.log('   4. slot_rule_groups - MISSING OR INCOMPLETE');
    console.log('   5. slot_rules - MISSING OR INCOMPLETE');
    console.log('');
    console.log('   Without slot_definitions, the system cannot:');
    console.log('   - Determine target metadata values for each slot');
    console.log('   - Select appropriate tracks based on musical characteristics');
    console.log('   - Create the slot-based sequencing that makes these channels unique');
    console.log('');
  }

  console.log('═══ RECOMMENDED ACTIONS ===\n');
  console.log('1. Export data from ORIGINAL database (https://eafyytltuwuxuuoevavo.supabase.co):');
  console.log('   - slot_strategies');
  console.log('   - slot_definitions');
  console.log('   - slot_boosts');
  console.log('   - slot_rule_groups');
  console.log('   - slot_rules');
  console.log('');
  console.log('2. Update the export script (export-complete-database-seed.ts) to include:');
  console.log('   const tables = [');
  console.log('     ...,');
  console.log('     "slot_strategies",');
  console.log('     "slot_definitions",      // ADD THIS');
  console.log('     "slot_boosts",           // ADD THIS');
  console.log('     "slot_rule_groups",      // ADD THIS');
  console.log('     "slot_rules",            // ADD THIS');
  console.log('     "saved_slot_sequences",');
  console.log('     ...');
  console.log('   ];');
  console.log('');
  console.log('3. Re-run export from original database');
  console.log('');
  console.log('4. Import complete dataset into new database');
  console.log('');
  console.log('5. Run this diagnostic again to verify');
  console.log('');

  const markdown = generateMarkdownReport();
  fs.writeFileSync('/tmp/cc-agent/60373310/project/NEW_DATABASE_DIAGNOSTIC_REPORT.md', markdown);
  console.log('📄 Detailed report saved to: NEW_DATABASE_DIAGNOSTIC_REPORT.md\n');
}

function generateMarkdownReport(): string {
  const errors = results.filter(r => r.status === 'ERROR');
  const warnings = results.filter(r => r.status === 'WARNING');

  let md = '# New Database Slot Strategy Diagnostic Report\n\n';
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `**Database:** ${process.env.VITE_SUPABASE_URL}\n\n`;

  md += '## Executive Summary\n\n';
  md += `- Total Checks: ${results.length}\n`;
  md += `- ✓ Passed: ${results.filter(r => r.status === 'OK').length}\n`;
  md += `- ⚠️  Warnings: ${warnings.length}\n`;
  md += `- ❌ Errors: ${errors.length}\n\n`;

  if (errors.length > 0) {
    md += '## Critical Errors\n\n';
    errors.forEach(e => {
      md += `### ${e.section}: ${e.message}\n\n`;
      if (e.details) {
        md += '```json\n' + JSON.stringify(e.details, null, 2) + '\n```\n\n';
      }
    });
  }

  if (warnings.length > 0) {
    md += '## Warnings\n\n';
    warnings.forEach(w => {
      md += `### ${w.section}: ${w.message}\n\n`;
      if (w.details) {
        md += '```json\n' + JSON.stringify(w.details, null, 2) + '\n```\n\n';
      }
    });
  }

  md += '## Root Cause\n\n';
  md += 'The slot sequence strategy system requires 5 interconnected tables to function:\n\n';
  md += '1. `slot_strategies` - Parent configuration table\n';
  md += '2. `slot_definitions` - Defines target metadata values for each slot (1-60 per strategy)\n';
  md += '3. `slot_boosts` - Defines field weighting for matching algorithms\n';
  md += '4. `slot_rule_groups` - Groups of filtering rules\n';
  md += '5. `slot_rules` - Individual filtering rules for track selection\n\n';
  md += 'The migration from the original database only included `slot_strategies`, leaving the new ';
  md += 'database with incomplete configuration data. Without `slot_definitions`, the slot strategy ';
  md += 'engine cannot determine which tracks to select for each slot position.\n\n';

  md += '## Detailed Results\n\n';
  results.forEach(r => {
    const icon = r.status === 'OK' ? '✓' : r.status === 'WARNING' ? '⚠️' : '❌';
    md += `${icon} **[${r.section}]** ${r.message}\n\n`;
  });

  return md;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     NEW DATABASE SLOT STRATEGY DIAGNOSTIC TOOL                 ║');
  console.log(`║     Database: ${supabaseUrl.substring(8, 40)}...  ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    await analyzeSchema();
    const { slotChannels } = await analyzeChannels();
    const { strategies } = await analyzeStrategies(slotChannels);
    await analyzeStrategyChildTables(strategies);
    await analyzeAudioTracks();
    await generateReport();
  } catch (error: any) {
    console.error('\n❌ Fatal error during diagnostics:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
