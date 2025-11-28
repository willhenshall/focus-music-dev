import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function batchPopulate() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 BATCH SQL POPULATE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const BATCH_SIZE = 1000;
  const MAX_BATCHES = 15; // 15 batches x 1000 = 15,000 tracks max

  for (let i = 1; i <= MAX_BATCHES; i++) {
    console.log(`\n📦 Running batch ${i}/${MAX_BATCHES}...`);

    const { data, error } = await supabase.rpc('exec_raw_sql', {
      query: `
        INSERT INTO audio_tracks (file_path, duration_seconds, metadata)
        SELECT
          '${supabaseUrl}/storage/v1/object/public/audio-files/' || REPLACE(o.name, '.json', '.mp3'),
          0,
          jsonb_build_object(
            'track_id', REPLACE(o.name, '.json', ''),
            'track_name', REPLACE(o.name, '.json', ''),
            'artist_name', 'Focus.Music',
            'needs_metadata_update', true
          )
        FROM storage.objects o
        WHERE o.bucket_id = 'audio-files'
          AND o.name LIKE '%.json'
          AND NOT EXISTS (
            SELECT 1 FROM audio_tracks at
            WHERE at.file_path = '${supabaseUrl}/storage/v1/object/public/audio-files/' || REPLACE(o.name, '.json', '.mp3')
          )
        LIMIT ${BATCH_SIZE};

        SELECT COUNT(*) as total FROM audio_tracks WHERE deleted_at IS NULL;
      `
    });

    if (error) {
      console.error('❌ Error:', error);
      break;
    }

    // Get current count
    const { count } = await supabase
      .from('audio_tracks')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null);

    console.log(`   ✅ Total tracks: ${count}`);

    // If we didn't insert a full batch, we're done
    if (count && i > 1) {
      const previousCount = count - BATCH_SIZE;
      if (count < previousCount + BATCH_SIZE) {
        console.log('\n✅ All tracks populated!');
        break;
      }
    }

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Final count
  const { count: finalCount } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 FINAL RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`💾 Total tracks in database: ${finalCount}\n`);
}

batchPopulate().catch(console.error);
