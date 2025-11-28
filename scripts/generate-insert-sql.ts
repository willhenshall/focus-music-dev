import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

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

function generateSQL() {
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

  console.log(`Processed ${channelMap.size} unique channels`);

  let sql = `-- Import ${channelMap.size} audio channels\n\n`;
  let channelNumber = 1;

  for (const [channelName, channelData] of channelMap.entries()) {
    const playlistDataJSON = JSON.stringify(channelData.playlists)
      .replace(/'/g, "''");

    sql += `INSERT INTO audio_channels (channel_number, channel_name, description, playlist_data, brain_type_affinity, neuroscience_tags)
VALUES (${channelNumber}, '${channelName.replace(/'/g, "''")}', '${channelName.replace(/'/g, "''")} focus channel', '${playlistDataJSON}'::jsonb, '{}', '{}');\n\n`;

    channelNumber++;
  }

  const outputPath = join(process.cwd(), 'supabase', 'migrations', 'insert_channels.sql');
  writeFileSync(outputPath, sql);
  console.log(`\nSQL file written to: ${outputPath}`);
  console.log(`Total channels: ${channelMap.size}`);
}

generateSQL();
