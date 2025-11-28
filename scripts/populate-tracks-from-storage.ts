import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TrackMetadata {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name?: string;
  genre?: string;
  year?: number;
  duration_seconds: number;
  file_size_bytes: number;
  sample_rate?: number;
  bit_rate?: number;
  channels?: number;
  file_format?: string;
  tags?: Record<string, any>;
}

async function populateTracksFromStorage() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 POPULATE TRACKS FROM STORAGE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📋 Listing all files in audio-files bucket...\n');

  const { data: files, error: listError } = await supabase.storage
    .from('audio-files')
    .list('', {
      limit: 10000,
    });

  if (listError) {
    console.error('❌ Error listing files:', listError);
    return;
  }

  if (!files || files.length === 0) {
    console.log('⚠️  No files found in storage bucket');
    return;
  }

  const audioFiles = files.filter(f =>
    f.name.endsWith('.mp3') ||
    f.name.endsWith('.wav') ||
    f.name.endsWith('.m4a') ||
    f.name.endsWith('.flac') ||
    f.name.endsWith('.aac') ||
    f.name.endsWith('.ogg') ||
    f.name.endsWith('.opus')
  );

  const jsonFiles = files.filter(f => f.name.endsWith('.json'));

  console.log(`✅ Found ${audioFiles.length} audio files`);
  console.log(`📄 Found ${jsonFiles.length} JSON sidecar files\n`);

  const jsonMap = new Map<string, any>();

  for (const jsonFile of jsonFiles) {
    const trackId = jsonFile.name.replace('.json', '');

    const { data: jsonData, error: jsonError } = await supabase.storage
      .from('audio-files')
      .download(jsonFile.name);

    if (!jsonError && jsonData) {
      try {
        const text = await jsonData.text();
        const metadata = JSON.parse(text);
        jsonMap.set(trackId, metadata);
      } catch (e) {
        console.log(`⚠️  Failed to parse ${jsonFile.name}`);
      }
    }
  }

  console.log(`📦 Loaded ${jsonMap.size} JSON metadata files\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('💾 Creating database records...\n');

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const audioFile of audioFiles) {
    const trackId = audioFile.name.replace(/\.(mp3|wav|m4a|flac|aac|ogg|opus)$/i, '');
    const jsonMetadata = jsonMap.get(trackId);

    if (!jsonMetadata) {
      console.log(`⚠️  No JSON metadata for ${trackId}, skipping...`);
      skipped++;
      continue;
    }

    const publicUrl = supabase.storage
      .from('audio-files')
      .getPublicUrl(audioFile.name).data.publicUrl;

    const metadata: TrackMetadata = {
      track_id: jsonMetadata.track_id || trackId,
      track_name: jsonMetadata.track_name || jsonMetadata.title || trackId,
      artist_name: jsonMetadata.artist_name || jsonMetadata.artist || 'Unknown Artist',
      album_name: jsonMetadata.album_name || jsonMetadata.album,
      genre: jsonMetadata.genre,
      year: jsonMetadata.year,
      duration_seconds: jsonMetadata.duration_seconds || jsonMetadata.duration || 0,
      file_size_bytes: audioFile.metadata?.size || 0,
      sample_rate: jsonMetadata.sample_rate,
      bit_rate: jsonMetadata.bit_rate,
      channels: jsonMetadata.channels,
      file_format: audioFile.name.split('.').pop()?.toLowerCase(),
      tags: jsonMetadata.tags || {}
    };

    const { error: insertError } = await supabase
      .from('audio_tracks')
      .insert({
        file_path: publicUrl,
        file_name: audioFile.name,
        file_size_bytes: metadata.file_size_bytes,
        duration_seconds: metadata.duration_seconds,
        metadata: metadata
      });

    if (insertError) {
      console.log(`❌ Error inserting ${trackId}: ${insertError.message}`);
      errors++;
    } else {
      created++;
      if (created % 10 === 0) {
        console.log(`✅ Created ${created} tracks...`);
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 POPULATION COMPLETE!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ Tracks created: ${created}`);
  console.log(`⚠️  Tracks skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}\n`);

  if (created > 0) {
    console.log('🎉 Success! Your tracks are ready to use.\n');
  }
}

populateTracksFromStorage().catch(console.error);
