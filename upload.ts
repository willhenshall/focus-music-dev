import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { config } from 'dotenv';

config();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function uploadWithFetch(audioPath: string, trackId: string) {
  const fileContent = readFileSync(audioPath);
  const storagePath = `${trackId}.mp3`;

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/audio-files/${storagePath}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true'
      },
      body: fileContent
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${error}`);
  }

  return storagePath;
}

async function uploadTrack(audioPath: string, jsonPath: string, trackId: string) {
  const sidecar = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  const metadata = sidecar.metadata;

  const storagePath = await uploadWithFetch(audioPath, trackId);
  const { data: urlData } = supabase.storage.from('audio-files').getPublicUrl(storagePath);

  const channelNames = metadata.channels ? metadata.channels.split(',').map((c: string) => c.trim()) : [];
  const { data: channel } = await supabase
    .from('audio_channels')
    .select('id')
    .ilike('name', channelNames[0])
    .maybeSingle();

  if (!channel) throw new Error(`Channel not found: ${channelNames[0]}`);

  const fileSize = statSync(audioPath).size;

  await supabase.from('audio_tracks').insert({
    channel_id: channel.id,
    title: metadata.track_name || 'Untitled',
    artist: metadata.artist_name || 'Unknown',
    album: metadata.album_name || '',
    duration: Number(metadata.duration) || null,
    tempo: Number(metadata.tempo) || null,
    file_path: storagePath,
    file_url: urlData.publicUrl,
    file_size: fileSize,
    genre: metadata.genre_category || null,
    speed: Number(metadata.speed) || null,
    intensity: Number(metadata.intensity) || null,
    arousal: Number(metadata.arousal) || null,
    valence: Number(metadata.valence) || null,
    brightness: Number(metadata.brightness) || null,
    complexity: Number(metadata.complexity) || null,
    energy_level: metadata.energy || null,
    legacy_track_id: metadata.track_id || null
  });
}

const [audioDir, jsonDir] = process.argv.slice(2);

if (!audioDir || !jsonDir) {
  console.error('Usage: npx tsx upload.ts <audio-directory> <json-directory>');
  process.exit(1);
}

const audioFiles = readdirSync(audioDir).filter(f => f.endsWith('.mp3'));
console.log(`Found ${audioFiles.length} audio files to process`);

for (const file of audioFiles) {
  const trackId = basename(file, '.mp3');
  const jsonPath = join(jsonDir, `${trackId}.json`);
  if (existsSync(jsonPath)) {
    try {
      await uploadTrack(join(audioDir, file), jsonPath, trackId);
      console.log(`✅ ${trackId}`);
    } catch (e) {
      console.log(`❌ ${trackId}: ${e}`);
    }
  } else {
    console.log(`⚠️  ${trackId}: No JSON file found`);
  }
}

console.log('Upload complete!');
