import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

const BATCH_SIZE = 500; // Process 500 files at a time
const BATCH_DELAY = 2000; // 2 second delay between batches

async function batchPopulateTracks() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 BATCH POPULATING TRACKS FROM STORAGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let offset = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let batchNumber = 1;

  while (true) {
    console.log(`\n📦 Processing batch ${batchNumber} (offset: ${offset})...`);

    const response = await fetch(
      `${supabaseUrl}/functions/v1/import-audio-simple`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          offset,
          limit: BATCH_SIZE,
        }),
      }
    );

    if (!response.ok) {
      console.error(`❌ HTTP error: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      break;
    }

    const result = await response.json();

    if (!result.success) {
      console.error('❌ Batch failed:', result.error);
      break;
    }

    console.log(`   ✅ Batch ${batchNumber} complete:`);
    console.log(`      Created: ${result.created}`);
    console.log(`      Skipped: ${result.skipped}`);
    console.log(`      Errors: ${result.errors}`);

    totalCreated += result.created;
    totalSkipped += result.skipped;
    totalErrors += result.errors;

    // If we processed fewer files than the batch size, we're done
    if (result.total_audio_files < BATCH_SIZE) {
      console.log('\n✅ All batches processed!');
      break;
    }

    offset += BATCH_SIZE;
    batchNumber++;

    // Wait before next batch to avoid overwhelming the system
    if (offset < 11000) {  // Still more to process
      console.log(`   ⏳ Waiting ${BATCH_DELAY}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 FINAL RESULTS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`💾 Total tracks created: ${totalCreated}`);
  console.log(`⏭️  Total skipped: ${totalSkipped}`);
  console.log(`❌ Total errors: ${totalErrors}`);
  console.log(`📦 Batches processed: ${batchNumber}\n`);
}

batchPopulateTracks().catch(console.error);
