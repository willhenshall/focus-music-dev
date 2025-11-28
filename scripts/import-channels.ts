import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface PlaylistTrack {
  track_id: number;
  weight: number;
}

interface ChannelJSON {
  channel: string;
  energy: string;
  k: number;
  tracks: PlaylistTrack[];
  model_version: string;
}

interface ChannelData {
  channel_name: string;
  playlists: {
    low: PlaylistTrack[];
    medium: PlaylistTrack[];
    high: PlaylistTrack[];
  };
}

async function importChannels() {
  const dataDir = join(process.cwd(), 'supabase', 'data');
  const files = readdirSync(dataDir).filter(f => f.endsWith('.json'));

  console.log(`Found ${files.length} JSON files`);

  const channelMap = new Map<string, ChannelData>();

  for (const file of files) {
    const filePath = join(dataDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const data: ChannelJSON = JSON.parse(content);

    const channelName = data.channel;
    const energyLevel = data.energy.toLowerCase() as 'low' | 'medium' | 'high';

    if (!channelMap.has(channelName)) {
      channelMap.set(channelName, {
        channel_name: channelName,
        playlists: {
          low: [],
          medium: [],
          high: []
        }
      });
    }

    const channel = channelMap.get(channelName)!;
    channel.playlists[energyLevel] = data.tracks;
  }

  console.log(`\nProcessed ${channelMap.size} unique channels`);

  let channelNumber = 1;
  const channelsToInsert = [];

  for (const [channelName, channelData] of channelMap.entries()) {
    channelsToInsert.push({
      channel_number: channelNumber++,
      channel_name: channelData.channel_name,
      description: `${channelData.channel_name} focus channel`,
      playlist_data: channelData.playlists,
      brain_type_affinity: [],
      neuroscience_tags: []
    });
  }

  console.log(`\nInserting ${channelsToInsert.length} channels into database...`);

  const { data, error } = await supabase
    .from('audio_channels')
    .insert(channelsToInsert)
    .select();

  if (error) {
    console.error('Error inserting channels:', error);
    process.exit(1);
  }

  console.log(`\n✓ Successfully inserted ${data?.length} channels`);

  for (const channel of data || []) {
    const playlistData = channel.playlist_data as any;
    console.log(`  - ${channel.channel_name}: ${playlistData.low?.length || 0} low, ${playlistData.medium?.length || 0} medium, ${playlistData.high?.length || 0} high tracks`);
  }
}

importChannels().catch(console.error);
