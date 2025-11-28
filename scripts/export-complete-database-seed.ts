import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: Missing Supabase credentials');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'Found' : 'Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? 'Found' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const tables = [
  'audio_channels',
  'audio_tracks',
  'user_profiles',
  'user_preferences',
  'system_preferences',
  'quiz_questions',
  'quiz_answers',
  'quiz_results',
  'channel_recommendations',
  'track_analytics',
  'user_playback_state',
  'image_sets',
  'image_set_images',
  'user_image_preferences',
  'slot_strategies',
  'slot_definitions',
  'slot_boosts',
  'slot_rule_groups',
  'slot_rules',
  'saved_slot_sequences',
  'playwright_test_registry',
  'test_runs'
];

interface TableData {
  table: string;
  rowCount: number;
  data: any[];
}

async function exportAllData() {
  console.log('Starting database export...\n');

  const allData: TableData[] = [];

  for (const table of tables) {
    try {
      console.log(`Exporting ${table}...`);

      let query = supabase.from(table).select('*');

      const { data: testData } = await supabase
        .from(table)
        .select('created_at')
        .limit(1);

      if (testData && testData.length > 0 && 'created_at' in testData[0]) {
        query = query.order('created_at', { ascending: true });
      }

      const { data, error } = await query;

      if (error) {
        console.warn(`Warning: Could not export ${table}: ${error.message}`);
        continue;
      }

      allData.push({
        table,
        rowCount: data?.length || 0,
        data: data || []
      });

      console.log(`  ✓ Exported ${data?.length || 0} rows from ${table}`);
    } catch (err: any) {
      console.warn(`Warning: Error exporting ${table}: ${err.message}`);
    }
  }

  const seedData = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    description: 'Complete database seed file for focus music platform',
    tables: allData,
    summary: {
      totalTables: allData.length,
      totalRows: allData.reduce((sum, t) => sum + t.rowCount, 0),
      tableBreakdown: allData.map(t => ({
        table: t.table,
        rows: t.rowCount
      }))
    }
  };

  const outputPath = path.join(process.cwd(), 'database-seed-complete.json');
  fs.writeFileSync(outputPath, JSON.stringify(seedData, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('DATABASE EXPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nExported ${seedData.summary.totalRows} total rows across ${seedData.summary.totalTables} tables`);
  console.log(`\nFile saved to: ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
  console.log('\nTable breakdown:');
  seedData.summary.tableBreakdown.forEach(t => {
    console.log(`  ${t.table.padEnd(30)} ${t.rows.toString().padStart(6)} rows`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('This seed file can be used to completely rebuild the database');
  console.log('using the import-database-seed.ts script.');
  console.log('='.repeat(60) + '\n');
}

exportAllData().catch(console.error);
