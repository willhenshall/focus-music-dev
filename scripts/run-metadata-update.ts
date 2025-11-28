import * as dotenv from 'dotenv';

dotenv.config();

async function runMetadataUpdate() {
  console.log('🎵 Updating all track metadata from sidecar files...\n');

  const edgeFunctionUrl = `${process.env.VITE_SUPABASE_URL}/functions/v1/update-track-metadata`;

  let offset = 0;
  const limit = 100;
  let totalUpdated = 0;
  let totalErrors = 0;
  let hasMore = true;
  let batchNum = 1;

  while (hasMore) {
    console.log(`📦 Batch ${batchNum} (offset: ${offset})...`);

    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        offset,
        limit,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Edge function error: ${error}`);
    }

    const result = await response.json();

    totalUpdated += result.updated;
    totalErrors += result.errors;
    hasMore = result.hasMore;
    offset = result.nextOffset;

    console.log(`  Processed: ${result.processed} | Updated: ${result.updated} | Errors: ${result.errors}`);
    console.log(`  Total so far: ${totalUpdated} updated, ${totalErrors} errors\n`);

    batchNum++;
  }

  console.log('🎉 Metadata update complete!');
  console.log(`   Total updated: ${totalUpdated}`);
  console.log(`   Total errors: ${totalErrors}`);
}

runMetadataUpdate().catch(console.error);
