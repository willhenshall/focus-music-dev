import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function findHaikuTracks() {
  // Check the haiku robot channel
  const { data: channel } = await supabase
    .from('audio_channels')
    .select('channel_name, playlist_data')
    .ilike('channel_name', '%haiku%')
    .single();
  
  console.log('Channel name:', channel?.channel_name);
  
  if (channel?.playlist_data) {
    let totalTracks = 0;
    ['low', 'medium', 'high'].forEach(energy => {
      const tracks = channel.playlist_data[energy]?.tracks || [];
      totalTracks += tracks.length;
      console.log(`${energy}:`, tracks.length, 'tracks');
    });
    console.log('Total tracks in channel:', totalTracks);
  }
  
  // Search in all text fields more broadly
  const { data: tracks1 } = await supabase
    .from('audio_tracks')
    .select('track_id, track_name, artist_name')
    .is('deleted_at', null)
    .or('track_name.ilike.%haiku%,artist_name.ilike.%haiku%')
    .limit(5);
  
  console.log('\nTracks with "haiku" anywhere:', tracks1);
  
  // Check if it's in metadata
  const { data: allTracks } = await supabase
    .from('audio_tracks')
    .select('track_id, track_name, artist_name, metadata')
    .is('deleted_at', null)
    .limit(100);
  
  const haikuMetadata = allTracks?.filter(t => {
    const meta = JSON.stringify(t.metadata || {}).toLowerCase();
    return meta.includes('haiku');
  });
  
  console.log('\nTracks with "haiku" in metadata:', haikuMetadata?.length);
  if (haikuMetadata && haikuMetadata.length > 0) {
    console.log('Sample:', haikuMetadata.slice(0, 2));
  }
}

findHaikuTracks().then(() => process.exit(0));
