import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

const BATCH_SIZE = 50; // Smaller batches to avoid timeouts
const TOTAL_TRACKS = 11240;

async function updateMetadataBatch() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 BATCH METADATA UPDATE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let offset = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let batchNumber = 1;

  while (offset < TOTAL_TRACKS) {
    console.log(`\n📦 Batch ${batchNumber} (offset: ${offset})...`);

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-track-metadata`,
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
        console.error(`   ❌ HTTP error: ${response.status}`);
        const text = await response.text();
        console.error(`   Response: ${text}`);
        break;
      }

      const result = await response.json();

      if (!result.success) {
        console.error(`   ❌ Batch failed: ${result.error}`);
        break;
      }

      console.log(`   ✅ Processed: ${result.processed}`);
      console.log(`   ✅ Updated: ${result.updated}`);
      console.log(`   ❌ Errors: ${result.errors}`);

      totalUpdated += result.updated;
      totalErrors += result.errors;

      if (!result.hasMore || result.processed === 0) {
        console.log('\n✅ All batches complete!');
        break;
      }

      offset = result.nextOffset;
      batchNumber++;

      // Calculate and display progress
      const progressPercent = ((offset / TOTAL_TRACKS) * 100).toFixed(1);
      console.log(`   📊 Progress: ${progressPercent}% (${offset}/${TOTAL_TRACKS})`);

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
      break;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 FINAL RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`💾 Total updated: ${totalUpdated}`);
  console.log(`❌ Total errors: ${totalErrors}`);
  console.log(`📦 Batches processed: ${batchNumber}\n`);
}

updateMetadataBatch().catch(console.error);
