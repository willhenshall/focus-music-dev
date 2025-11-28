/**
 * Process Channel Playlist Files
 *
 * This script reads all channel playlist JSON files from supabase/data/
 * and updates the audio_channels table with the playlist data.
 *
 * Expected file naming: "{ChannelName}__{ENERGY}.json"
 * Example: "The Grid__LOW.json", "Tranquility__HIGH.json"
 *
 * Run with: npx tsx scripts/process-playlist-files.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type PlaylistFile = {
  channel: string;
  energy: 'LOW' | 'MEDIUM' | 'HIGH';
  k: number;
  tracks: Array<{
    track_id: number;
    weight: number;
  }>;
  model_version: string;
};

async function processPlaylistFiles() {
  const dataDir = join(process.cwd(), 'supabase', 'data');

  console.log('Reading playlist files from:', dataDir);

  const files = await readdir(dataDir);
  const playlistFiles = files.filter(f => f.endsWith('.json') && f.includes('__'));

  console.log(`Found ${playlistFiles.length} playlist files`);

  // Group files by channel
  const channelPlaylists = new Map<string, { low?: string[], medium?: string[], high?: string[] }>();

  for (const filename of playlistFiles) {
    try {
      const filePath = join(dataDir, filename);
      const content = await readFile(filePath, 'utf-8');
      const data: PlaylistFile = JSON.parse(content);

      const channelName = data.channel;
      const energyLevel = data.energy.toLowerCase() as 'low' | 'medium' | 'high';

      // Extract track_ids in order
      const trackIds = data.tracks.map(t => t.track_id.toString());

      if (!channelPlaylists.has(channelName)) {
        channelPlaylists.set(channelName, {});
      }

      const playlists = channelPlaylists.get(channelName)!;
      playlists[energyLevel] = trackIds;

      console.log(`  ✓ Loaded ${channelName} ${energyLevel} (${trackIds.length} tracks)`);
    } catch (error) {
      console.error(`  ✗ Error processing ${filename}:`, error.message);
    }
  }

  console.log(`\nProcessed ${channelPlaylists.size} unique channels`);

  // Get the highest channel number currently in the database
  const { data: maxChannel } = await supabase
    .from('audio_channels')
    .select('channel_number')
    .order('channel_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextChannelNumber = (maxChannel?.channel_number || 0) + 1;

  // Sort channels by name for consistent numbering
  const sortedChannels = Array.from(channelPlaylists.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Create or update each channel in the database
  for (const [channelName, playlists] of sortedChannels) {
    try {
      // Find the channel by name
      const { data: channel, error: findError } = await supabase
        .from('audio_channels')
        .select('id, channel_number, channel_name')
        .eq('channel_name', channelName)
        .maybeSingle();

      if (findError) {
        console.error(`  ✗ Error finding channel "${channelName}":`, findError.message);
        continue;
      }

      const playlistData = {
        low: playlists.low || [],
        medium: playlists.medium || [],
        high: playlists.high || []
      };

      if (!channel) {
        // Create new channel
        const { error: insertError } = await supabase
          .from('audio_channels')
          .insert({
            channel_number: nextChannelNumber,
            channel_name: channelName,
            playlist_data: playlistData
          });

        if (insertError) {
          console.error(`  ✗ Error creating channel "${channelName}":`, insertError.message);
        } else {
          const totalTracks = (playlists.low?.length || 0) + (playlists.medium?.length || 0) + (playlists.high?.length || 0);
          console.log(`  ✓ Created channel #${nextChannelNumber} "${channelName}" (${totalTracks} total tracks)`);
          nextChannelNumber++;
        }
      } else {
        // Update existing channel
        const { error: updateError } = await supabase
          .from('audio_channels')
          .update({ playlist_data: playlistData })
          .eq('id', channel.id);

        if (updateError) {
          console.error(`  ✗ Error updating channel "${channelName}":`, updateError.message);
        } else {
          const totalTracks = (playlists.low?.length || 0) + (playlists.medium?.length || 0) + (playlists.high?.length || 0);
          console.log(`  ✓ Updated channel #${channel.channel_number} "${channelName}" (${totalTracks} total tracks)`);
        }
      }
    } catch (error) {
      console.error(`  ✗ Error processing channel "${channelName}":`, error.message);
    }
  }

  console.log('\n✅ Playlist processing complete!');
}

processPlaylistFiles().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
