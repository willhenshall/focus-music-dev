import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

async function importAudioFiles() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 IMPORTING AUDIO FILES FROM STORAGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const response = await fetch(
    `${supabaseUrl}/functions/v1/import-audio-files`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storageBucket: 'audio-files',
        dryRun: false
      }),
    }
  );

  if (!response.ok) {
    console.error(`❌ HTTP error: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.error('Response:', text);
    return;
  }

  const result = await response.json();

  console.log('Raw result:', JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error('❌ Import failed:', result.error);
    return;
  }

  if (!result.results) {
    console.error('❌ No results in response');
    return;
  }

  console.log('\n📊 IMPORT RESULTS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ Processed: ${result.results.processed}`);
  console.log(`💾 Inserted: ${result.results.inserted}`);
  console.log(`⏭️  Skipped: ${result.results.skipped}`);
  console.log(`❌ Errors: ${result.results.errors.length}\n`);

  if (result.results.errors.length > 0) {
    console.log('⚠️  ERRORS:\n');
    result.results.errors.forEach((error: string, i: number) => {
      if (i < 20) {
        console.log(`   ${i + 1}. ${error}`);
      }
    });
    if (result.results.errors.length > 20) {
      console.log(`   ... and ${result.results.errors.length - 20} more errors`);
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ ${result.message}\n`);
}

importAudioFiles().catch(console.error);
