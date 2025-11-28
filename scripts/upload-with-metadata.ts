import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_NAME = 'audio-files';
const PROGRESS_FILE = 'upload-with-metadata-progress.json';

interface TrackMetadata {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string;
  duration: string;
  tempo: string;
  file: string;
  catalog: string;
  file_length: string;
  genre_category: string;
  speed: string;
  intensity: string;
  arousal: string;
  valence: string;
  brightness: string;
  complexity: string;
  music_key_type: string;
  music_key_value: string;
  energy: string;
  rating: string;
  channels: string;
  channel_ids: string;
  [key: string]: any;
}

interface UploadProgress {
  uploadedTracks: string[];
  failedTracks: { trackId: string; error: string }[];
  totalTracks: number;
  completedCount: number;
}

function loadProgress(): UploadProgress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    uploadedTracks: [],
    failedTracks: [],
    totalTracks: 0,
    completedCount: 0
  };
}

function saveProgress(progress: UploadProgress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function findChannelId(channelName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('audio_channels')
    .select('id')
    .ilike('name', channelName.trim())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}

async function uploadTrackWithMetadata(
  audioPath: string,
  jsonPath: string,
  trackId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Read JSON metadata
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    const sidecar = JSON.parse(jsonContent);
    const metadata: TrackMetadata = sidecar.metadata;

    // Upload audio file to storage
    const fileContent = fs.readFileSync(audioPath);
    const storagePath = `${trackId}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileContent, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    // Find channel by name
    const channelNames = metadata.channels ? metadata.channels.split(',').map(c => c.trim()) : [];
    let channelId: string | null = null;

    if (channelNames.length > 0) {
      channelId = await findChannelId(channelNames[0]);
    }

    if (!channelId) {
      return { success: false, error: `Channel not found: ${channelNames.join(', ')}` };
    }

    // Parse numeric values safely
    const parseFloat = (val: string | undefined): number | null => {
      if (!val || val === '') return null;
      const parsed = Number(val);
      return isNaN(parsed) ? null : parsed;
    };

    const parseInt = (val: string | undefined): number | null => {
      if (!val || val === '') return null;
      const parsed = Number(val);
      return isNaN(parsed) ? null : parsed;
    };

    // Insert into database
    const { error: dbError } = await supabase
      .from('audio_tracks')
      .insert({
        channel_id: channelId,
        title: metadata.track_name || 'Untitled',
        artist: metadata.artist_name || 'Unknown Artist',
        album: metadata.album_name || '',
        duration: parseFloat(metadata.duration),
        tempo: parseInt(metadata.tempo),
        file_path: storagePath,
        file_url: urlData.publicUrl,
        file_size: parseInt(metadata.file_length),
        genre: metadata.genre_category || null,
        speed: parseFloat(metadata.speed),
        intensity: parseFloat(metadata.intensity),
        arousal: parseFloat(metadata.arousal),
        valence: parseFloat(metadata.valence),
        brightness: parseFloat(metadata.brightness),
        complexity: parseFloat(metadata.complexity),
        music_key_type: parseInt(metadata.music_key_type),
        music_key_value: parseInt(metadata.music_key_value),
        energy_level: metadata.energy || null,
        catalog: metadata.catalog || null,
        legacy_track_id: metadata.track_id || null,
        is_preview: false,
        deleted_at: null
      });

    if (dbError) {
      // If it's a duplicate, that's okay - consider it success
      if (dbError.code === '23505') {
        return { success: true };
      }
      return { success: false, error: `Database insert failed: ${dbError.message}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('\n❌ ERROR: Please provide paths to both audio and JSON folders\n');
    console.log('Usage: npm run upload-with-metadata <audio-folder> <json-folder>\n');
    console.log('Example: npm run upload-with-metadata /Volumes/EXTERNAL/focus-audio /Volumes/EXTERNAL/focus-audio-sidecar-json\n');
    process.exit(1);
  }

  const audioDir = args[0];
  const jsonDir = args[1];

  if (!fs.existsSync(audioDir)) {
    console.log(`\n❌ ERROR: Audio directory not found: ${audioDir}\n`);
    process.exit(1);
  }

  if (!fs.existsSync(jsonDir)) {
    console.log(`\n❌ ERROR: JSON directory not found: ${jsonDir}\n`);
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 AUDIO FILE + METADATA UPLOAD TOOL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get all audio files
  console.log('🔍 Scanning for audio files...\n');
  const audioFiles = fs.readdirSync(audioDir)
    .filter(f => f.endsWith('.mp3'))
    .map(f => {
      const trackId = path.basename(f, '.mp3');
      return {
        trackId,
        audioPath: path.join(audioDir, f),
        jsonPath: path.join(jsonDir, `${trackId}.json`)
      };
    })
    .filter(item => fs.existsSync(item.jsonPath));

  console.log(`✅ Found ${audioFiles.length} tracks with metadata\n`);

  let progress = loadProgress();

  if (progress.uploadedTracks.length > 0) {
    console.log(`📋 Resuming previous upload...`);
    console.log(`   Already uploaded: ${progress.uploadedTracks.length} tracks`);
    console.log(`   Failed: ${progress.failedTracks.length} tracks\n`);
  }

  progress.totalTracks = audioFiles.length;

  const tracksToUpload = audioFiles.filter(t => !progress.uploadedTracks.includes(t.trackId));

  if (tracksToUpload.length === 0) {
    console.log('✅ All tracks already uploaded!\n');
    return;
  }

  console.log(`📤 Starting upload of ${tracksToUpload.length} tracks...\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();

  for (let i = 0; i < tracksToUpload.length; i++) {
    const track = tracksToUpload[i];

    const result = await uploadTrackWithMetadata(
      track.audioPath,
      track.jsonPath,
      track.trackId
    );

    if (result.success) {
      progress.uploadedTracks.push(track.trackId);
      progress.completedCount++;

      const percent = Math.round((progress.completedCount / progress.totalTracks) * 100);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = progress.completedCount / elapsed;
      const remaining = rate > 0 ? Math.round((tracksToUpload.length - i - 1) / rate) : 0;

      console.log(`✅ [${percent}%] Track ${track.trackId}`);
      console.log(`   Progress: ${progress.completedCount}/${progress.totalTracks} | Time: ${elapsed}s | ETA: ${remaining}s\n`);
    } else {
      progress.failedTracks.push({ trackId: track.trackId, error: result.error || 'Unknown error' });
      console.log(`❌ FAILED: Track ${track.trackId}`);
      console.log(`   Error: ${result.error}\n`);
    }

    // Save progress every 10 tracks
    if (i % 10 === 0 || result.success === false) {
      saveProgress(progress);
    }
  }

  saveProgress(progress);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 UPLOAD COMPLETE!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ Successfully uploaded: ${progress.uploadedTracks.length} tracks`);
  console.log(`❌ Failed: ${progress.failedTracks.length} tracks`);
  console.log(`⏱️  Total time: ${Math.round((Date.now() - startTime) / 1000)}s\n`);

  if (progress.failedTracks.length > 0) {
    console.log('❌ FAILED TRACKS:');
    progress.failedTracks.slice(0, 50).forEach(f => {
      console.log(`   ${f.trackId}: ${f.error}`);
    });
    if (progress.failedTracks.length > 50) {
      console.log(`   ... and ${progress.failedTracks.length - 50} more`);
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ Done! Your audio files and metadata are uploaded.\n');
}

main().catch(console.error);
