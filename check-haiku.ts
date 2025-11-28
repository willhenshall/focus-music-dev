import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function checkChannel() {
  const { data: channels } = await supabase
    .from('audio_channels')
    .select('channel_name, id')
    .ilike('channel_name', '%haiku%');

  console.log('Matching channels:', channels);
  
  if (!channels || channels.length === 0) {
    console.log('No channels found');
    return;
  }
  
  const channel = channels[0];
  const { data: full } = await supabase
    .from('audio_channels')
    .select('*')
    .eq('id', channel.id)
    .single();
    
  console.log('\nPlaylist Strategy:', JSON.stringify(full.playlist_strategy, null, 2));
  
  const lowEnergy = full.playlist_data?.low;
  const tracks = Array.isArray(lowEnergy) ? lowEnergy : lowEnergy?.tracks;
  
  console.log('\nLow Energy - First 10 track IDs:');
  console.log(tracks?.slice(0, 10).map((t: any) => t.track_id || t));
}

checkChannel();
