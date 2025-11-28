import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function completeCleanup() {
  console.log('🧹 COMPLETE AUDIO SYSTEM CLEANUP');
  console.log('=================================\n');
  console.log('This will delete:');
  console.log('  1. All audio files from storage');
  console.log('  2. All sidecar JSON files from storage');
  console.log('  3. All audio_tracks database records\n');
  console.log('⚠️  WARNING: This is IRREVERSIBLE!');
  console.log('⏳ Starting in 5 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 1: Delete Audio Files from Storage');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let audioDeleted = 0;
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const { data: files, error } = await supabase
      .storage
      .from('audio-files')
      .list('', { limit: 1000, offset });

    if (error || !files || files.length === 0) {
      hasMore = false;
      break;
    }

    const { error: deleteError } = await supabase
      .storage
      .from('audio-files')
      .remove(files.map(f => f.name));

    if (!deleteError) {
      audioDeleted += files.length;
      console.log(`   Deleted ${files.length} files (total: ${audioDeleted})`);
    }

    if (files.length < 1000) hasMore = false;
  }

  console.log(`✅ Deleted ${audioDeleted} audio files\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 2: Delete Sidecar Files from Storage');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let sidecarDeleted = 0;
  hasMore = true;
  offset = 0;

  while (hasMore) {
    const { data: files, error } = await supabase
      .storage
      .from('audio-sidecars')
      .list('', { limit: 1000, offset });

    if (error || !files || files.length === 0) {
      hasMore = false;
      break;
    }

    const { error: deleteError } = await supabase
      .storage
      .from('audio-sidecars')
      .remove(files.map(f => f.name));

    if (!deleteError) {
      sidecarDeleted += files.length;
      console.log(`   Deleted ${files.length} files (total: ${sidecarDeleted})`);
    }

    if (files.length < 1000) hasMore = false;
  }

  console.log(`✅ Deleted ${sidecarDeleted} sidecar files\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('STEP 3: Clear audio_tracks Table');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const { count: beforeCount } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });

  console.log(`   Current records: ${beforeCount}`);

  const { error: dbError } = await supabase
    .from('audio_tracks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (dbError) {
    console.error('❌ Error clearing database:', dbError);
  } else {
    console.log('✅ Cleared all database records\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CLEANUP COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📊 Summary:`);
  console.log(`   - Audio files deleted: ${audioDeleted}`);
  console.log(`   - Sidecar files deleted: ${sidecarDeleted}`);
  console.log(`   - Database records cleared: ${beforeCount}\n`);
  console.log('✅ System is now ready for fresh import of 11,295 audio files');
}

completeCleanup().catch(console.error);
