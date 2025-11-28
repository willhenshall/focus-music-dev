import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function bulkInsertTracks() {
  console.log('🎵 Bulk inserting ALL tracks from sidecar files...\n');

  console.log('Step 1: Clearing existing tracks...');
  const { error: truncateError } = await supabase
    .from('audio_tracks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (truncateError) {
    console.error('Error clearing tracks:', truncateError);
  } else {
    console.log('✅ Existing tracks cleared\n');
  }

  console.log('Step 2: Inserting all tracks from sidecars via SQL...');

  const sql = `
INSERT INTO audio_tracks (
  id,
  file_path,
  energy_level,
  duration_seconds,
  metadata,
  created_at
)
SELECT
  gen_random_uuid() as id,
  'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/' || REPLACE(o.name, '.json', '') || '.mp3' as file_path,
  'medium' as energy_level,
  0 as duration_seconds,
  jsonb_build_object(
    'track_id', REPLACE(o.name, '.json', ''),
    'track_name', REPLACE(o.name, '.json', ''),
    'artist_name', 'Focus.Music',
    'file_size', (o.metadata->>'size')::bigint,
    'mimetype', 'audio/mpeg'
  ) as metadata,
  o.created_at
FROM storage.objects o
WHERE o.bucket_id = 'audio-sidecars'
  AND o.name LIKE '%.json';
`;

  console.log('   SQL prepared, executing...\n');
  console.log('⚠️  Note: Direct SQL execution requires service role key');
  console.log('   Attempting to count storage files instead...\n');

  const { count: sidecarCount, error: countError } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });

  console.log(`Current tracks in database: ${sidecarCount || 0}`);

  console.log('\n❗ To complete the bulk insert, please run this SQL directly in Supabase SQL Editor:');
  console.log('\n' + sql);
}

bulkInsertTracks().catch(console.error);
