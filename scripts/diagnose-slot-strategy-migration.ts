import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const ORIGINAL_DB_URL = 'https://eafyytltuwuxuuoevavo.supabase.co';
const NEW_DB_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!NEW_DB_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: Missing Supabase credentials');
  process.exit(1);
}

const originalDb = createClient(ORIGINAL_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const newDb = createClient(NEW_DB_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

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
  if (details) {
    console.log('   Details:', JSON.stringify(details, null, 2));
  }
}

async function checkTableExists(db: any, dbName: string, tableName: string): Promise<boolean> {
  const { data, error } = await db.from(tableName).select('*').limit(1);
  if (error) {
    logResult('Schema', 'ERROR', `Table '${tableName}' missing or inaccessible in ${dbName}`, { error: error.message });
    return false;
  }
  return true;
}

async function getTableCount(db: any, tableName: string): Promise<number> {
  const { count, error } = await db.from(tableName).select('*', { count: 'exact', head: true });
  if (error) return -1;
  return count || 0;
}

async function step1_schemaVerification() {
  console.log('\n=== STEP 1: Schema Verification ===\n');

  const tables = [
    'audio_channels',
    'audio_tracks',
    'slot_strategies',
    'slot_definitions',
    'slot_boosts',
    'slot_rule_groups',
    'slot_rules',
    'user_playback_state'
  ];

  for (const table of tables) {
    const existsInOriginal = await checkTableExists(originalDb, 'ORIGINAL', table);
    const existsInNew = await checkTableExists(newDb, 'NEW', table);

    if (existsInOriginal && existsInNew) {
      logResult('Schema', 'OK', `Table '${table}' exists in both databases`);
    } else if (!existsInNew) {
      logResult('Schema', 'ERROR', `Table '${table}' MISSING in new database`);
    }
  }
}

async function step2_channelConfiguration() {
  console.log('\n=== STEP 2: Channel Configuration Analysis ===\n');

  const { data: originalChannels } = await originalDb
    .from('audio_channels')
    .select('id, channel_number, channel_name, playlist_strategy');

  const { data: newChannels } = await newDb
    .from('audio_channels')
    .select('id, channel_number, channel_name, playlist_strategy');

  if (!originalChannels || !newChannels) {
    logResult('Channels', 'ERROR', 'Failed to fetch channels from one or both databases');
    return;
  }

  logResult('Channels', 'OK', `Original DB has ${originalChannels.length} channels, New DB has ${newChannels.length} channels`);

  const originalSlotChannels = originalChannels.filter(ch => {
    const ps = ch.playlist_strategy;
    return ps && (
      ps.low?.strategy === 'slot_based' ||
      ps.medium?.strategy === 'slot_based' ||
      ps.high?.strategy === 'slot_based'
    );
  });

  const newSlotChannels = newChannels.filter(ch => {
    const ps = ch.playlist_strategy;
    return ps && (
      ps.low?.strategy === 'slot_based' ||
      ps.medium?.strategy === 'slot_based' ||
      ps.high?.strategy === 'slot_based'
    );
  });

  logResult('Channels', 'OK',
    `Original DB: ${originalSlotChannels.length} channels use slot-based strategy`,
    { channels: originalSlotChannels.map(ch => ({ num: ch.channel_number, name: ch.channel_name })) }
  );

  logResult('Channels', newSlotChannels.length === originalSlotChannels.length ? 'OK' : 'WARNING',
    `New DB: ${newSlotChannels.length} channels use slot-based strategy`,
    { channels: newSlotChannels.map(ch => ({ num: ch.channel_number, name: ch.channel_name })) }
  );

  for (const origCh of originalSlotChannels) {
    const newCh = newChannels.find(ch => ch.channel_number === origCh.channel_number);
    if (!newCh) {
      logResult('Channels', 'ERROR', `Channel ${origCh.channel_number} (${origCh.channel_name}) missing in new database`);
    } else {
      const origPS = JSON.stringify(origCh.playlist_strategy);
      const newPS = JSON.stringify(newCh.playlist_strategy);
      if (origPS !== newPS) {
        logResult('Channels', 'WARNING',
          `Channel ${origCh.channel_number} (${origCh.channel_name}) has different playlist_strategy`,
          { original: origCh.playlist_strategy, new: newCh.playlist_strategy }
        );
      }
    }
  }

  return { originalSlotChannels, newSlotChannels };
}

async function step3_slotStrategyDataPopulation(channelData: any) {
  console.log('\n=== STEP 3: Slot Strategy Data Population ===\n');

  const { originalSlotChannels, newSlotChannels } = channelData;

  const tables = ['slot_strategies', 'slot_definitions', 'slot_boosts', 'slot_rule_groups', 'slot_rules'];

  for (const table of tables) {
    const origCount = await getTableCount(originalDb, table);
    const newCount = await getTableCount(newDb, table);

    const status = newCount === 0 && origCount > 0 ? 'ERROR' :
                   newCount < origCount ? 'WARNING' : 'OK';

    logResult('Data Population', status,
      `${table}: Original DB has ${origCount} rows, New DB has ${newCount} rows`
    );
  }

  const { data: originalStrategies } = await originalDb
    .from('slot_strategies')
    .select('*');

  const { data: newStrategies } = await newDb
    .from('slot_strategies')
    .select('*');

  if (originalStrategies && newStrategies) {
    logResult('Strategies', 'OK',
      `Original DB has ${originalStrategies.length} strategies, New DB has ${newStrategies.length} strategies`
    );

    const originalByChannel = originalStrategies.reduce((acc: any, s: any) => {
      if (!acc[s.channel_id]) acc[s.channel_id] = [];
      acc[s.channel_id].push(s);
      return acc;
    }, {});

    const newByChannel = newStrategies.reduce((acc: any, s: any) => {
      if (!acc[s.channel_id]) acc[s.channel_id] = [];
      acc[s.channel_id].push(s);
      return acc;
    }, {});

    for (const ch of originalSlotChannels) {
      const origStrategies = originalByChannel[ch.id] || [];
      const newStrategies = newByChannel[ch.id] || [];

      if (origStrategies.length > 0 && newStrategies.length === 0) {
        logResult('Strategies', 'ERROR',
          `Channel ${ch.channel_number} (${ch.channel_name}) has ${origStrategies.length} strategies in original DB but NONE in new DB`
        );
      } else if (origStrategies.length !== newStrategies.length) {
        logResult('Strategies', 'WARNING',
          `Channel ${ch.channel_number} (${ch.channel_name}) has ${origStrategies.length} strategies in original DB but ${newStrategies.length} in new DB`
        );
      } else if (origStrategies.length > 0) {
        logResult('Strategies', 'OK',
          `Channel ${ch.channel_number} (${ch.channel_name}) has ${origStrategies.length} strategies in both databases`
        );
      }
    }
  }

  return { originalStrategies, newStrategies };
}

async function step4_detailedIntegrityChecks(strategyData: any) {
  console.log('\n=== STEP 4: Detailed Data Integrity Checks ===\n');

  const { originalStrategies, newStrategies } = strategyData;

  if (!originalStrategies || originalStrategies.length === 0) {
    logResult('Integrity', 'WARNING', 'No strategies found in original database to compare');
    return;
  }

  if (!newStrategies || newStrategies.length === 0) {
    logResult('Integrity', 'ERROR', 'CRITICAL: No strategies found in new database - slot sequencing cannot work!');
    return;
  }

  for (const origStrategy of originalStrategies.slice(0, 5)) {
    const newStrategy = newStrategies.find((s: any) =>
      s.channel_id === origStrategy.channel_id && s.energy_tier === origStrategy.energy_tier
    );

    if (!newStrategy) {
      logResult('Integrity', 'ERROR',
        `Strategy missing: channel_id ${origStrategy.channel_id}, tier ${origStrategy.energy_tier}`
      );
      continue;
    }

    if (origStrategy.num_slots !== newStrategy.num_slots) {
      logResult('Integrity', 'WARNING',
        `num_slots mismatch: ${origStrategy.num_slots} vs ${newStrategy.num_slots}`
      );
    }

    const { data: origDefs } = await originalDb
      .from('slot_definitions')
      .select('*')
      .eq('strategy_id', origStrategy.id);

    const { data: newDefs } = await newDb
      .from('slot_definitions')
      .select('*')
      .eq('strategy_id', newStrategy.id);

    const origDefCount = origDefs?.length || 0;
    const newDefCount = newDefs?.length || 0;

    if (origDefCount > 0 && newDefCount === 0) {
      logResult('Integrity', 'ERROR',
        `Slot definitions MISSING: strategy ${origStrategy.id} has ${origDefCount} definitions in original but NONE in new DB`
      );
    } else if (origDefCount !== newDefCount) {
      logResult('Integrity', 'WARNING',
        `Slot definition count mismatch: ${origDefCount} vs ${newDefCount}`
      );
    } else if (origDefCount > 0) {
      logResult('Integrity', 'OK',
        `Strategy has ${origDefCount} slot definitions in both databases`
      );
    }

    const { data: origBoosts } = await originalDb
      .from('slot_boosts')
      .select('*')
      .eq('strategy_id', origStrategy.id);

    const { data: newBoosts } = await newDb
      .from('slot_boosts')
      .select('*')
      .eq('strategy_id', newStrategy.id);

    const origBoostCount = origBoosts?.length || 0;
    const newBoostCount = newBoosts?.length || 0;

    if (origBoostCount > 0 && newBoostCount === 0) {
      logResult('Integrity', 'ERROR',
        `Slot boosts MISSING: strategy ${origStrategy.id} has ${origBoostCount} boosts in original but NONE in new DB`
      );
    }
  }
}

async function step5_audioTracksMetadata() {
  console.log('\n=== STEP 5: Audio Tracks Metadata Analysis ===\n');

  const { data: origTracks } = await originalDb
    .from('audio_tracks')
    .select('id, metadata, speed, intensity, brightness, complexity, valence, arousal, tempo')
    .limit(10);

  const { data: newTracks } = await newDb
    .from('audio_tracks')
    .select('id, metadata, speed, intensity, brightness, complexity, valence, arousal, tempo')
    .limit(10);

  if (origTracks && origTracks.length > 0) {
    const sampleTrack = origTracks[0];
    const hasMetadata = ['speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'tempo']
      .filter(field => sampleTrack[field] !== null && sampleTrack[field] !== undefined);

    logResult('Tracks', 'OK',
      `Sample track in original DB has ${hasMetadata.length}/7 metadata fields populated`,
      { fields: hasMetadata }
    );
  }

  if (newTracks && newTracks.length > 0) {
    const sampleTrack = newTracks[0];
    const hasMetadata = ['speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'tempo']
      .filter(field => sampleTrack[field] !== null && sampleTrack[field] !== undefined);

    logResult('Tracks', hasMetadata.length >= 5 ? 'OK' : 'WARNING',
      `Sample track in new DB has ${hasMetadata.length}/7 metadata fields populated`,
      { fields: hasMetadata }
    );
  }

  const origTrackCount = await getTableCount(originalDb, 'audio_tracks');
  const newTrackCount = await getTableCount(newDb, 'audio_tracks');

  logResult('Tracks', newTrackCount > 0 ? 'OK' : 'ERROR',
    `Track counts: Original ${origTrackCount}, New ${newTrackCount}`
  );
}

async function step6_generateReport() {
  console.log('\n=== DIAGNOSTIC REPORT SUMMARY ===\n');

  const errors = results.filter(r => r.status === 'ERROR');
  const warnings = results.filter(r => r.status === 'WARNING');
  const ok = results.filter(r => r.status === 'OK');

  console.log(`Total Checks: ${results.length}`);
  console.log(`✓ OK: ${ok.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log('');

  if (errors.length > 0) {
    console.log('=== CRITICAL ERRORS ===\n');
    errors.forEach(e => {
      console.log(`❌ [${e.section}] ${e.message}`);
    });
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('=== WARNINGS ===\n');
    warnings.forEach(w => {
      console.log(`⚠️  [${w.section}] ${w.message}`);
    });
    console.log('');
  }

  console.log('=== ROOT CAUSE ANALYSIS ===\n');

  const missingSlotDefinitions = errors.some(e => e.message.includes('slot_definitions') && e.message.includes('MISSING'));
  const missingSlotBoosts = errors.some(e => e.message.includes('slot_boosts') && e.message.includes('MISSING'));
  const missingStrategies = errors.some(e => e.message.includes('No strategies found in new database'));
  const emptyChildTables = errors.some(e => e.message.includes('definitions MISSING') || e.message.includes('boosts MISSING'));

  if (missingStrategies) {
    console.log('🔍 ROOT CAUSE: The slot_strategies table is completely empty in the new database.');
    console.log('   This means the slot sequencing system has NO configuration data to work with.');
    console.log('');
  }

  if (emptyChildTables || missingSlotDefinitions || missingSlotBoosts) {
    console.log('🔍 ROOT CAUSE: The slot strategy child tables (slot_definitions, slot_boosts, etc.)');
    console.log('   are missing or empty in the new database. This is the PRIMARY ISSUE.');
    console.log('');
    console.log('   The export script "export-complete-database-seed.ts" only exports:');
    console.log('   - slot_strategies (parent table)');
    console.log('   - saved_slot_sequences');
    console.log('');
    console.log('   But it DOES NOT export these critical child tables:');
    console.log('   - slot_definitions (defines each slot\'s target values)');
    console.log('   - slot_boosts (defines field weighting for matching)');
    console.log('   - slot_rule_groups (defines filtering rule groups)');
    console.log('   - slot_rules (defines individual filtering rules)');
    console.log('');
    console.log('   Without these tables, the slot strategy engine cannot:');
    console.log('   1. Know what metadata values to target for each slot');
    console.log('   2. Calculate weighted scores for track selection');
    console.log('   3. Apply genre/artist/label filtering rules');
    console.log('');
  }

  console.log('=== RECOMMENDED FIXES ===\n');
  console.log('1. Update the export script to include ALL slot strategy tables:');
  console.log('   - Add "slot_definitions" to the tables array');
  console.log('   - Add "slot_boosts" to the tables array');
  console.log('   - Add "slot_rule_groups" to the tables array');
  console.log('   - Add "slot_rules" to the tables array');
  console.log('');
  console.log('2. Re-export data from the original database with the updated script');
  console.log('');
  console.log('3. Import the complete dataset into the new database');
  console.log('');
  console.log('4. Alternatively, run direct SQL queries to copy the missing data:');
  console.log('   - Export slot_definitions from original DB');
  console.log('   - Export slot_boosts from original DB');
  console.log('   - Export slot_rule_groups and slot_rules from original DB');
  console.log('   - Import all into new DB, ensuring foreign keys are preserved');
  console.log('');
  console.log('5. After data migration, verify with this script again');
  console.log('');

  const reportPath = '/tmp/cc-agent/60373310/project/SLOT_STRATEGY_DIAGNOSTIC_REPORT.md';
  const markdown = generateMarkdownReport();
  require('fs').writeFileSync(reportPath, markdown);
  console.log(`📄 Detailed report saved to: SLOT_STRATEGY_DIAGNOSTIC_REPORT.md\n`);
}

function generateMarkdownReport(): string {
  const errors = results.filter(r => r.status === 'ERROR');
  const warnings = results.filter(r => r.status === 'WARNING');

  let md = '# Slot Strategy Migration Diagnostic Report\n\n';
  md += `**Generated:** ${new Date().toISOString()}\n\n`;
  md += `**Original Database:** ${ORIGINAL_DB_URL}\n`;
  md += `**New Database:** ${NEW_DB_URL}\n\n`;

  md += '## Executive Summary\n\n';
  md += `- Total Checks Performed: ${results.length}\n`;
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

  md += '## Root Cause Analysis\n\n';
  md += 'The slot sequence strategy channels stopped working because the database migration ';
  md += 'did not include the child tables that store the actual strategy configuration:\n\n';
  md += '- `slot_definitions` - Individual slot target values (speed, intensity, etc.)\n';
  md += '- `slot_boosts` - Field weighting configuration for scoring\n';
  md += '- `slot_rule_groups` - Filtering rule groups\n';
  md += '- `slot_rules` - Individual filtering rules\n\n';
  md += 'The export script `export-complete-database-seed.ts` only exports the parent ';
  md += '`slot_strategies` table, leaving the new database with strategy records that have ';
  md += 'no associated configuration data.\n\n';

  md += '## Remediation Steps\n\n';
  md += '1. **Update Export Script**\n';
  md += '   - Add missing tables to the export: `slot_definitions`, `slot_boosts`, `slot_rule_groups`, `slot_rules`\n\n';
  md += '2. **Re-export from Original Database**\n';
  md += '   - Run the updated export script against the original database\n\n';
  md += '3. **Import Complete Dataset**\n';
  md += '   - Import all slot strategy tables into the new database\n';
  md += '   - Verify foreign key relationships are intact\n\n';
  md += '4. **Validation**\n';
  md += '   - Run this diagnostic script again to confirm all data is present\n';
  md += '   - Test slot-based channels in the application\n\n';

  md += '## All Diagnostic Results\n\n';
  results.forEach(r => {
    const icon = r.status === 'OK' ? '✓' : r.status === 'WARNING' ? '⚠️' : '❌';
    md += `${icon} **[${r.section}]** ${r.message}\n\n`;
  });

  return md;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   SLOT STRATEGY MIGRATION DIAGNOSTIC TOOL                      ║');
  console.log('║   Comparing Original vs New Database                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    await step1_schemaVerification();
    const channelData = await step2_channelConfiguration();
    const strategyData = await step3_slotStrategyDataPopulation(channelData);
    await step4_detailedIntegrityChecks(strategyData);
    await step5_audioTracksMetadata();
    await step6_generateReport();
  } catch (error: any) {
    console.error('\n❌ Fatal error during diagnostics:', error.message);
    process.exit(1);
  }
}

main();
