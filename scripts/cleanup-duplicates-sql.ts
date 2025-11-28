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

async function cleanupDuplicatesForChannel(channelId: string, channelName: string, playlistData: any) {
  console.log(`\nProcessing: ${channelName} (ID: ${channelId})`);

  let channelModified = false;
  const updatedPlaylistData = { ...playlistData };
  let totalDuplicates = 0;

  for (const energyLevel of ['low', 'medium', 'high']) {
    const energyData = playlistData?.[energyLevel];

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
      totalDuplicates += duplicatesCount;
      console.log(`  ${energyLevel}: ${originalCount} → ${uniqueTracks.length} tracks (removed ${duplicatesCount} duplicates)`);
    } else {
      console.log(`  ${energyLevel}: ${originalCount} tracks (no duplicates)`);
    }
  }

  if (channelModified) {
    const { error: updateError } = await supabase
      .from('audio_channels')
      .update({ playlist_data: updatedPlaylistData })
      .eq('id', channelId);

    if (updateError) {
      console.error(`  ❌ Error updating channel: ${updateError.message}`);
      return { success: false, duplicatesRemoved: 0 };
    } else {
      console.log(`  ✅ Updated successfully - removed ${totalDuplicates} total duplicates`);
      return { success: true, duplicatesRemoved: totalDuplicates };
    }
  } else {
    console.log(`  ✓ No changes needed`);
    return { success: true, duplicatesRemoved: 0 };
  }
}

async function cleanupAllChannels() {
  console.log('Starting duplicate track cleanup for all energy playlists...\n');

  const { data: channels, error, count } = await supabase
    .from('audio_channels')
    .select('id, channel_name', { count: 'exact' });

  if (error) {
    console.error('Error fetching channels:', error);
    return;
  }

  if (!channels || channels.length === 0) {
    console.log('No channels found.');
    return;
  }

  console.log(`Found ${channels.length} channels total\n`);

  let totalChannelsProcessed = 0;
  let totalDuplicatesRemoved = 0;

  for (const channel of channels) {
    const { data: fullChannel, error: fetchError } = await supabase
      .from('audio_channels')
      .select('id, channel_name, playlist_data')
      .eq('id', channel.id)
      .single();

    if (fetchError || !fullChannel) {
      console.error(`Error fetching channel ${channel.channel_name}:`, fetchError);
      continue;
    }

    const result = await cleanupDuplicatesForChannel(
      fullChannel.id,
      fullChannel.channel_name,
      fullChannel.playlist_data
    );

    if (result.success) {
      totalChannelsProcessed++;
      totalDuplicatesRemoved += result.duplicatesRemoved;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('CLEANUP SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total channels processed: ${totalChannelsProcessed} / ${channels.length}`);
  console.log(`Total duplicates removed: ${totalDuplicatesRemoved}`);
  console.log('='.repeat(60));
}

cleanupAllChannels().catch(console.error);
