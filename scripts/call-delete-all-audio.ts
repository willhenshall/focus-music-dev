import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

async function deleteAllAudio() {
  console.log('🗑️  Deleting ALL audio files from storage...\n');

  const response = await fetch(
    `${supabaseUrl}/functions/v1/delete-all-audio`,
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
    console.error('❌ Function error:', result.error);
    return;
  }

  console.log(`✅ ${result.message}`);
  console.log(`   Files deleted: ${result.deleted}`);
}

deleteAllAudio().catch(console.error);
