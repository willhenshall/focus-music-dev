import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

async function populateTracksViaSQL() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 POPULATING TRACKS VIA SQL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Running SQL migration to create basic track records...\n');

  // This SQL creates basic records for all audio files in storage
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      INSERT INTO audio_tracks (file_path, duration_seconds, metadata)
      SELECT
        '${supabaseUrl}/storage/v1/object/public/audio-files/' || REPLACE(name, '.json', '.mp3'),
        0,
        jsonb_build_object(
          'track_id', REPLACE(name, '.json', ''),
          'track_name', REPLACE(name, '.json', ''),
          'artist_name', 'Focus.Music',
          'needs_metadata_update', true
        )
      FROM storage.objects
      WHERE bucket_id = 'audio-files'
        AND name LIKE '%.json'
      ON CONFLICT (file_path) DO NOTHING;

      SELECT COUNT(*) as total FROM audio_tracks WHERE deleted_at IS NULL;
    `
  });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('✅ Basic track records created!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

populateTracksViaSQL().catch(console.error);
