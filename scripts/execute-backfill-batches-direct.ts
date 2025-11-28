import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing SUPABASE credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeBatches() {
  console.log('🎵 Starting metadata backfill execution...');
  console.log('='.repeat(60));

  let successCount = 0;
  let failedCount = 0;

  for (let i = 1; i <= 23; i++) {
    const batchNum = i.toString().padStart(2, '0');
    const sqlFile = `/tmp/backfill_batch_${batchNum}.sql`;

    console.log(`\n📦 Batch ${i}/23:`);
    console.log(`   Reading ${sqlFile}...`);

    try {
      const sql = readFileSync(sqlFile, 'utf-8');
      console.log(`   Size: ${(sql.length / 1024).toFixed(2)} KB`);
      console.log(`   Executing...`);

      // Execute via RPC
      const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

      if (error) {
        throw error;
      }

      console.log(`   ✓ Batch ${i} completed successfully`);

      // Log progress to progress table
      await supabase.from('metadata_backfill_progress').insert({
        batch_number: i,
        tracks_updated: 500  // approximate
      });

      successCount++;

      // Brief pause between batches
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (err: any) {
      console.error(`   ✗ Error executing batch ${i}:`, err.message);
      failedCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Successful batches: ${successCount}`);
  console.log(`   Failed batches: ${failedCount}`);

  if (failedCount === 0) {
    console.log('\n✓ All batches completed successfully!');

    // Show final stats
    console.log('\n📊 Final verification:');
    const { data } = await supabase
      .from('audio_tracks')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('tempo', 'is', null);

    console.log(`   Tracks with tempo populated: ${data}`);
  } else {
    console.log(`\n⚠ ${failedCount} batches failed`);
    process.exit(1);
  }
}

executeBatches().catch(console.error);
