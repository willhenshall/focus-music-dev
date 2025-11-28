import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

async function updateAllMetadata() {
  console.log('🎵 Updating track metadata via edge function...\n');

  let offset = 0;
  const limit = 50;
  let hasMore = true;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  while (hasMore) {
    console.log(`📦 Processing batch at offset ${offset}...`);

    const response = await fetch(
      `${supabaseUrl}/functions/v1/update-track-metadata`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offset, limit }),
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
      console.error('❌ Function error:', result.error);
      break;
    }

    console.log(`   ✅ Processed: ${result.processed}, Updated: ${result.updated}, Errors: ${result.errors}`);

    totalProcessed += result.processed;
    totalUpdated += result.updated;
    totalErrors += result.errors;

    hasMore = result.hasMore;
    offset = result.nextOffset;

    if (result.processed === 0) {
      break;
    }
  }

  console.log('\n🎉 Metadata update complete!');
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Total updated: ${totalUpdated}`);
  console.log(`   Total errors: ${totalErrors}`);
}

updateAllMetadata().catch(console.error);
