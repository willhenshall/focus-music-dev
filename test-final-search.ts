import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function testFinalSearch() {
  console.log('=== Test 1: Search for "haiku robot" ===');
  const searchTerm1 = 'haiku robot';
  const trackFieldSearch1 = 'track_name.ilike.%' + searchTerm1 + '%,artist_name.ilike.%' + searchTerm1 + '%,track_id.ilike.%' + searchTerm1 + '%,genre.ilike.%' + searchTerm1 + '%,metadata->>track_name.ilike.%' + searchTerm1 + '%,metadata->>artist_name.ilike.%' + searchTerm1 + '%,metadata->>album_name.ilike.%' + searchTerm1 + '%';
  
  const { count: count1, error: error1 } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .or(trackFieldSearch1);
  
  console.log('Error:', error1);
  console.log('Count:', count1);
  
  console.log('\n=== Test 2: Search for "the grid" (with channel matching) ===');
  const searchTerm2 = 'the grid';
  
  // Get channel IDs
  const { data: channels } = await supabase
    .from('audio_channels')
    .select('id, channel_name, playlist_data')
    .order('channel_number');
  
  const matchingChannels = channels?.filter(ch =>
    ch.channel_name.toLowerCase().includes(searchTerm2.toLowerCase())
  ) || [];
  
  const trackIdSet = new Set<string>();
  matchingChannels.forEach(channel => {
    ['low', 'medium', 'high'].forEach(energy => {
      const energyData = channel.playlist_data?.[energy];
      const tracks = energyData?.tracks || [];
      tracks.forEach((t: any) => {
        if (t.track_id) trackIdSet.add(t.track_id.toString());
      });
    });
  });
  const channelMatchedTrackIds = Array.from(trackIdSet);
  
  const trackFieldSearch2 = 'track_name.ilike.%' + searchTerm2 + '%,artist_name.ilike.%' + searchTerm2 + '%,track_id.ilike.%' + searchTerm2 + '%,genre.ilike.%' + searchTerm2 + '%,metadata->>track_name.ilike.%' + searchTerm2 + '%,metadata->>artist_name.ilike.%' + searchTerm2 + '%,metadata->>album_name.ilike.%' + searchTerm2 + '%';
  const orClause2 = trackFieldSearch2 + ',track_id.in.(' + channelMatchedTrackIds.join(',') + ')';
  
  const { count: count2, error: error2 } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .or(orClause2);
  
  console.log('Channel matched track IDs:', channelMatchedTrackIds.length);
  console.log('Error:', error2);
  console.log('Count:', count2);
}

testFinalSearch().then(() => process.exit(0));
