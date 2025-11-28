import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

async function checkStatus() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 METADATA UPDATE STATUS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT
        COUNT(*) FILTER (WHERE metadata->>'track_name' != metadata->>'track_id') as updated,
        COUNT(*) FILTER (WHERE metadata->>'track_name' = metadata->>'track_id') as pending,
        COUNT(*) as total
      FROM audio_tracks
      WHERE deleted_at IS NULL;
    `
  }).single();

  if (error) {
    // Fallback query
    const { count: total } = await supabase
      .from('audio_tracks')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);

    console.log(`Total tracks: ${total}`);
    console.log('\n(Use SQL query for detailed breakdown)');
    return;
  }

  const updated = data?.updated || 0;
  const pending = data?.pending || 0;
  const total = data?.total || 0;
  const percentComplete = ((updated / total) * 100).toFixed(1);

  console.log(`✅ Tracks with full metadata: ${updated.toLocaleString()}`);
  console.log(`⏳ Tracks pending update: ${pending.toLocaleString()}`);
  console.log(`📊 Total tracks: ${total.toLocaleString()}`);
  console.log(`\n📈 Progress: ${percentComplete}% complete\n`);

  if (pending > 0) {
    // Estimate time remaining (assuming 50 tracks per minute)
    const minutesRemaining = Math.ceil(pending / 50);
    console.log(`⏱️  Estimated time remaining: ~${minutesRemaining} minutes\n`);
  } else {
    console.log('🎉 Metadata update is COMPLETE!\n');
  }
}

checkStatus().catch(console.error);
