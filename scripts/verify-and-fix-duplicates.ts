import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface PlaylistTrack {
  track_id: string;
  [key: string]: any;
}

async function verifyAndFixDuplicates() {
  console.log('Verifying and fixing duplicates in all energy playlists...\n');

  const { data: channels, error } = await supabase
    .from('audio_channels')
    .select('id, channel_name, playlist_data');

  if (error) {
    console.error('Error fetching channels:', error);
    return;
  }

  if (!channels || channels.length === 0) {
    console.log('No channels found.');
    return;
  }

  console.log(`Found ${channels.length} channels\n`);

  let totalChannelsFixed = 0;
  let totalDuplicatesRemoved = 0;
  const channelsWithDuplicates: string[] = [];

  for (const channel of channels) {
    let channelModified = false;
    const updatedPlaylistData = { ...channel.playlist_data };
    let channelDuplicates = 0;

    for (const energyLevel of ['low', 'medium', 'high']) {
      const energyData = channel.playlist_data?.[energyLevel];

      if (!energyData) continue;

      let tracks: PlaylistTrack[] = [];

      if (Array.isArray(energyData)) {
        tracks = energyData;
      } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
        tracks = energyData.tracks;
      }

      if (tracks.length === 0) continue;

      const originalCount = tracks.length;
      const seenTrackIds = new Set<string>();
      const uniqueTracks: PlaylistTrack[] = [];
      const duplicateIds: string[] = [];

      for (const track of tracks) {
        if (!seenTrackIds.has(track.track_id)) {
          seenTrackIds.add(track.track_id);
          uniqueTracks.push(track);
        } else {
          duplicateIds.push(track.track_id);
        }
      }

      const duplicatesCount = originalCount - uniqueTracks.length;

      if (duplicatesCount > 0) {
        if (Array.isArray(energyData)) {
          updatedPlaylistData[energyLevel] = uniqueTracks;
        } else {
          updatedPlaylistData[energyLevel] = {
            ...energyData,
            tracks: uniqueTracks
          };
        }

        channelModified = true;
        channelDuplicates += duplicatesCount;
        console.log(`${channel.channel_name} - ${energyLevel}: ${originalCount} → ${uniqueTracks.length} (removed ${duplicatesCount})`);
        console.log(`  Duplicate track IDs: ${[...new Set(duplicateIds)].join(', ')}`);
      }
    }

    if (channelModified) {
      console.log(`\nUpdating ${channel.channel_name}...`);

      const { error: updateError } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id);

      if (updateError) {
        console.error(`❌ Error updating: ${updateError.message}\n`);
      } else {
        console.log(`✅ Successfully removed ${channelDuplicates} duplicates\n`);
        totalChannelsFixed++;
        totalDuplicatesRemoved += channelDuplicates;
        channelsWithDuplicates.push(channel.channel_name);
      }
    }
  }

  console.log('='.repeat(60));
  console.log('VERIFICATION & FIX SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total channels checked: ${channels.length}`);
  console.log(`Channels with duplicates: ${totalChannelsFixed}`);
  console.log(`Total duplicates removed: ${totalDuplicatesRemoved}`);

  if (channelsWithDuplicates.length > 0) {
    console.log('\nChannels fixed:');
    channelsWithDuplicates.forEach(name => console.log(`  - ${name}`));
  }

  console.log('='.repeat(60));
}

verifyAndFixDuplicates().catch(console.error);
