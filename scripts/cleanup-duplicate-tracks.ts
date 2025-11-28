import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables!');
  console.error('VITE_SUPABASE_URL:', supabaseUrl);
  console.error('VITE_SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'present' : 'missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface PlaylistTrack {
  track_id: string;
  [key: string]: any;
}

async function cleanupDuplicateTracks() {
  console.log('Starting duplicate track cleanup for all energy playlists...\n');

  const { data: channels, error } = await supabase
    .from('audio_channels')
    .select('id, channel_name, playlist_data')
    .eq('playlist_type', 'energy_based');

  if (error) {
    console.error('Error fetching channels:', error);
    return;
  }

  if (!channels || channels.length === 0) {
    console.log('No energy-based channels found.');
    return;
  }

  console.log(`Found ${channels.length} energy-based channels\n`);

  let totalChannelsProcessed = 0;
  let totalPlaylistsProcessed = 0;
  let totalDuplicatesRemoved = 0;

  for (const channel of channels) {
    console.log(`\nProcessing: ${channel.channel_name} (ID: ${channel.id})`);

    let channelModified = false;
    const updatedPlaylistData = { ...channel.playlist_data };

    for (const energyLevel of ['low', 'medium', 'high']) {
      const energyData = channel.playlist_data?.[energyLevel];

      if (!energyData) {
        console.log(`  ${energyLevel}: No data`);
        continue;
      }

      let tracks: PlaylistTrack[] = [];

      if (Array.isArray(energyData)) {
        tracks = energyData;
      } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
        tracks = energyData.tracks;
      }

      if (tracks.length === 0) {
        console.log(`  ${energyLevel}: Empty (0 tracks)`);
        continue;
      }

      const originalCount = tracks.length;
      const seenTrackIds = new Set<string>();
      const uniqueTracks: PlaylistTrack[] = [];

      for (const track of tracks) {
        if (!seenTrackIds.has(track.track_id)) {
          seenTrackIds.add(track.track_id);
          uniqueTracks.push(track);
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
        totalDuplicatesRemoved += duplicatesCount;
        console.log(`  ${energyLevel}: ${originalCount} → ${uniqueTracks.length} tracks (removed ${duplicatesCount} duplicates)`);
      } else {
        console.log(`  ${energyLevel}: ${originalCount} tracks (no duplicates)`);
      }

      totalPlaylistsProcessed++;
    }

    if (channelModified) {
      const { error: updateError } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id);

      if (updateError) {
        console.error(`  ❌ Error updating channel: ${updateError.message}`);
      } else {
        console.log(`  ✅ Updated successfully`);
        totalChannelsProcessed++;
      }
    } else {
      console.log(`  ✓ No changes needed`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('CLEANUP SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total channels processed: ${totalChannelsProcessed} / ${channels.length}`);
  console.log(`Total playlists checked: ${totalPlaylistsProcessed}`);
  console.log(`Total duplicates removed: ${totalDuplicatesRemoved}`);
  console.log('='.repeat(60));
}

cleanupDuplicateTracks().catch(console.error);
