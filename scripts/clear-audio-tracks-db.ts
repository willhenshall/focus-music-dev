import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function clearAudioTracksTable() {
  console.log('🗑️  CLEARING AUDIO_TRACKS TABLE');
  console.log('=================================\n');

  console.log('⚠️  WARNING: This will permanently delete all track records!');
  console.log('⏳ Starting in 3 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('📊 Counting current tracks...');
  const { count: beforeCount, error: countError } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error counting tracks:', countError);
    return;
  }

  console.log(`   Current tracks: ${beforeCount}\n`);

  console.log('🗑️  Deleting all records...');
  const { error: deleteError } = await supabase
    .from('audio_tracks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (deleteError) {
    console.error('❌ Error deleting tracks:', deleteError);
    return;
  }

  console.log('📊 Verifying deletion...');
  const { count: afterCount, error: verifyError } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });

  if (verifyError) {
    console.error('❌ Error verifying:', verifyError);
    return;
  }

  console.log(`   Remaining tracks: ${afterCount}\n`);

  if (afterCount === 0) {
    console.log('✅ COMPLETE: All audio_tracks records deleted successfully');
  } else {
    console.log(`⚠️  WARNING: ${afterCount} records still remain`);
  }
}

clearAudioTracksTable().catch(console.error);
