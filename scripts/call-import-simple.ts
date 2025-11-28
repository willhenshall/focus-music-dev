import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

async function importAudioFiles() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 IMPORTING AUDIO FILES FROM STORAGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const response = await fetch(
    `${supabaseUrl}/functions/v1/import-audio-simple`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    console.error(`❌ HTTP error: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.error('Response:', text);
    return;
  }

  const result = await response.json();

  if (!result.success) {
    console.error('❌ Import failed:', result.error);
    return;
  }

  console.log('📊 IMPORT RESULTS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📁 Total audio files: ${result.total_audio_files}`);
  console.log(`📄 Total JSON files: ${result.total_json_files}`);
  console.log(`💾 Tracks created: ${result.created}`);
  console.log(`⏭️  Skipped (already exist): ${result.skipped}`);
  console.log(`❌ Errors: ${result.errors}\n`);

  if (result.error_details && result.error_details.length > 0) {
    console.log('⚠️  ERROR DETAILS (first 20):\n');
    result.error_details.forEach((error: string, i: number) => {
      console.log(`   ${i + 1}. ${error}`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ ${result.message}\n`);
}

importAudioFiles().catch(console.error);
