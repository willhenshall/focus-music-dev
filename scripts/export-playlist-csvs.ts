import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface PlaylistTrack {
  track_id: string;
  [key: string]: any;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function exportPlaylistCSVs() {
  console.log('Exporting all energy playlists to CSV files...\n');

  const outputDir = path.join(process.cwd(), 'playlist-exports');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const { data: channels, error } = await supabase
    .from('audio_channels')
    .select('id, channel_name, playlist_data')
    .order('channel_name');

  if (error) {
    console.error('Error fetching channels:', error);
    return;
  }

  if (!channels || channels.length === 0) {
    console.log('No channels found.');
    return;
  }

  console.log(`Found ${channels.length} channels\n`);

  let totalFilesCreated = 0;
  let totalTracksExported = 0;

  for (const channel of channels) {
    const sanitizedChannelName = sanitizeFilename(channel.channel_name);

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

      const filename = `${sanitizedChannelName}_${energyLevel}.csv`;
      const filepath = path.join(outputDir, filename);

      const allKeys = new Set<string>();
      tracks.forEach(track => {
        Object.keys(track).forEach(key => allKeys.add(key));
      });

      const headers = ['track_id', ...Array.from(allKeys).filter(k => k !== 'track_id').sort()];

      const csvLines: string[] = [];
      csvLines.push(headers.map(escapeCSV).join(','));

      tracks.forEach(track => {
        const row = headers.map(header => escapeCSV(track[header]));
        csvLines.push(row.join(','));
      });

      fs.writeFileSync(filepath, csvLines.join('\n'), 'utf-8');

      console.log(`✓ ${channel.channel_name} - ${energyLevel}: ${tracks.length} tracks → ${filename}`);
      totalFilesCreated++;
      totalTracksExported += tracks.length;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('EXPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`CSV files created: ${totalFilesCreated}`);
  console.log(`Total tracks exported: ${totalTracksExported}`);
  console.log(`Output directory: ${outputDir}`);
  console.log('='.repeat(60));
}

exportPlaylistCSVs().catch(console.error);
