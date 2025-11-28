import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: Missing Supabase credentials');
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

async function verifyData() {
  console.log('Verifying database seed data...\n');

  const results: Array<{ table: string; count: number; error?: string }> = [];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        results.push({ table, count: 0, error: error.message });
      } else {
        results.push({ table, count: count || 0 });
      }
    } catch (err: any) {
      results.push({ table, count: 0, error: err.message });
    }
  }

  console.log('='.repeat(70));
  console.log('DATABASE VERIFICATION RESULTS');
  console.log('='.repeat(70));
  console.log('');

  const maxTableLength = Math.max(...results.map(r => r.table.length));

  for (const result of results) {
    const tableName = result.table.padEnd(maxTableLength);
    const countStr = result.count.toString().padStart(8);

    if (result.error) {
      console.log(`❌ ${tableName} ${countStr} rows  Error: ${result.error}`);
    } else if (result.count === 0) {
      console.log(`⚠️  ${tableName} ${countStr} rows  (empty)`);
    } else {
      console.log(`✓  ${tableName} ${countStr} rows`);
    }
  }

  console.log('');
  console.log('='.repeat(70));

  const totalRows = results.reduce((sum, r) => sum + r.count, 0);
  const errors = results.filter(r => r.error).length;
  const emptyTables = results.filter(r => !r.error && r.count === 0).length;

  console.log(`Total rows: ${totalRows}`);
  console.log(`Tables with errors: ${errors}`);
  console.log(`Empty tables: ${emptyTables}`);
  console.log('='.repeat(70));
  console.log('');

  if (errors > 0) {
    console.log('⚠️  Some tables could not be verified. Check RLS policies and permissions.');
  } else if (totalRows === 0) {
    console.log('⚠️  No data found in any tables. Import may have failed or database is empty.');
  } else {
    console.log('✓ Database verification complete!');
  }

  console.log('');
}

verifyData().catch(console.error);
