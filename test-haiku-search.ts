import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function testHaikuSearch() {
  const searchTerm = 'haiku robot';
  
  // Test 1: Check if any channels match
  const { data: channels } = await supabase
    .from('audio_channels')
    .select('channel_name')
    .order('channel_number');
  
  const matchingChannels = channels?.filter(ch =>
    ch.channel_name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];
  
  console.log('Channels matching "haiku robot":', matchingChannels.length);
  
  // Test 2: Search just artist_name
  const { count: artistCount } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .ilike('artist_name', `%${searchTerm}%`);
  
  console.log('Tracks with "haiku robot" in artist_name:', artistCount);
  
  // Test 3: Try the OR query without channel matching
  const { count: orCount, error } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .or(`track_name.ilike.%${searchTerm}%,artist_name.ilike.%${searchTerm}%,track_id.ilike.%${searchTerm}%,genre.ilike.%${searchTerm}%`);
  
  console.log('Query error:', error);
  console.log('Tracks matching OR query:', orCount);
  
  // Test 4: Sample results
  const { data: samples } = await supabase
    .from('audio_tracks')
    .select('track_id, track_name, artist_name')
    .is('deleted_at', null)
    .ilike('artist_name', `%${searchTerm}%`)
    .limit(3);
  
  console.log('\nSample tracks:', samples);
}

testHaikuSearch().then(() => process.exit(0));
