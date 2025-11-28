import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function countHaikuInMetadata() {
  // Try to search in metadata using JSONB operators
  const { data, error, count } = await supabase
    .from('audio_tracks')
    .select('track_id, track_name, artist_name, metadata', { count: 'exact' })
    .is('deleted_at', null)
    .ilike('metadata->>artist_name', '%haiku robot%')
    .limit(5);
  
  console.log('Error:', error);
  console.log('Count of tracks with "haiku robot" in metadata.artist_name:', count);
  console.log('Sample:', data?.map(t => ({
    track_id: t.track_id || t.metadata?.track_id,
    track_name: t.track_name || t.metadata?.track_name,
    artist_name: t.artist_name || t.metadata?.artist_name
  })));
}

countHaikuInMetadata().then(() => process.exit(0));
