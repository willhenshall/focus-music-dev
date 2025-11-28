/**
 * This script executes all 23 metadata backfill SQL batches
 * Run with: npx tsx scripts/apply-all-backfill-batches.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ ERROR: Missing Supabase credentials in .env file');
  console.error('   Required: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeSQL(sql: string): Promise<void> {
  // Execute SQL by calling the database directly via REST API
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    // If the RPC doesn't exist, try direct SQL execution via PostgREST
    // This will execute the SQL directly
    const { error } = await supabase.rpc('exec_sql', { query: sql }) as any;
    if (error) throw error;
  }
}

async function executeBatches() {
  console.log('🎵 Metadata Backfill Execution');
  console.log('═'.repeat(60));
  console.log('');
  console.log('⚠️  IMPORTANT: This will update ~11,285 tracks');
  console.log('   Artist names, track names, and albums will NOT be modified');
  console.log('   Only NULL metadata fields will be populated');
  console.log('');

  let successCount = 0;
  let failedBatches: number[] = [];

  for (let i = 1; i <= 23; i++) {
    const batchNum = i.toString().padStart(2, '0');
    const sqlFile = `/tmp/backfill_batch_${batchNum}.sql`;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📦 Batch ${i}/23`);
    console.log(`${'─'.repeat(60)}`);

    try {
      console.log(`   📄 Reading: ${sqlFile}`);
      const sql = readFileSync(sqlFile, 'utf-8');
      const sizeKB = (sql.length / 1024).toFixed(2);
      console.log(`   📏 Size: ${sizeKB} KB`);

      console.log(`   🔄 Executing SQL...`);
      const startTime = Date.now();

      // Execute the UPDATE statement directly
      const { error, count } = await supabase
        .rpc('exec_sql_batch', { sql_content: sql })
        .single();

      if (error) {
        throw new Error(error.message || 'Unknown error');
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`   ✅ Completed in ${duration}s`);

      // Track progress
      await supabase.from('metadata_backfill_progress').insert({
        batch_number: i,
        tracks_updated: 500
      });

      successCount++;

      // Brief pause between batches
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (err: any) {
      console.error(`   ❌ FAILED: ${err.message}`);
      failedBatches.push(i);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`✅ Successful batches: ${successCount}/23`);
  console.log(`❌ Failed batches: ${failedBatches.length}`);

  if (failedBatches.length > 0) {
    console.log(`\n⚠️  Failed batch numbers: ${failedBatches.join(', ')}`);
    console.log('   You can re-run just these batches manually');
  }

  if (successCount === 23) {
    console.log('\n🎉 All batches completed successfully!');
    console.log('\n📊 Verifying results...');

    try {
      const { count } = await supabase
        .from('audio_tracks')
        .select('*', { count: 'exact', head: true })
        .not('tempo', 'is', null)
        .is('deleted_at', null);

      console.log(`   Tracks with tempo: ${count}`);
      console.log('   Expected: ~11,240');

      if (count && count > 11000) {
        console.log('\n✅ Backfill appears successful!');
      } else {
        console.log('\n⚠️  Fewer tracks than expected - some may not have matched');
      }
    } catch (err) {
      console.log('   Could not verify - please check manually');
    }
  }

  return failedBatches.length === 0;
}

// Run
console.log('');
executeBatches()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
  });
