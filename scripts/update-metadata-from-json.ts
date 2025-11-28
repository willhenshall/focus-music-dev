import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials in .env file');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function updateMetadataFromJSON() {
  console.log('🎵 Updating track metadata from JSON sidecar files...\n');

  // Get all tracks that need metadata updates
  const { data: tracks, error: tracksError } = await supabase
    .from('audio_tracks')
    .select('id, file_path, metadata')
    .is('deleted_at', null)
    .order('created_at');

  if (tracksError) {
    console.error('❌ Error fetching tracks:', tracksError);
    return;
  }

  if (!tracks || tracks.length === 0) {
    console.log('⚠️  No tracks found to update');
    return;
  }

  console.log(`📦 Found ${tracks.length} tracks to update\n`);

  let updated = 0;
  let errors = 0;
  let skipped = 0;

  for (const track of tracks) {
    try {
      // Extract track ID from file_path
      const match = track.file_path.match(/\/([^/]+)\.mp3$/);
      if (!match) {
        console.warn(`   ⚠️  Could not extract track ID from: ${track.file_path}`);
        skipped++;
        continue;
      }

      const trackId = match[1];
      const jsonFileName = `${trackId}.json`;

      // Download the JSON sidecar file
      const { data: jsonData, error: downloadError } = await supabase.storage
        .from('audio-files')
        .download(jsonFileName);

      if (downloadError) {
        console.warn(`   ⚠️  JSON not found for track ${trackId}`);
        skipped++;
        continue;
      }

      const text = await jsonData.text();
      const metadata = JSON.parse(text);

      // Update the track with rich metadata
      const { error: updateError } = await supabase
        .from('audio_tracks')
        .update({
          duration_seconds: metadata.duration_seconds || metadata.duration || 0,
          metadata: {
            track_id: trackId,
            track_name: metadata.title || metadata.track_name || trackId,
            artist_name: metadata.artist || metadata.artist_name || 'Focus.Music',
            duration: metadata.duration,
            duration_seconds: metadata.duration_seconds,
            bpm: metadata.bpm,
            key: metadata.key,
            genre: metadata.genre,
            album: metadata.album,
            file_size: metadata.file_size,
            bitrate: metadata.bitrate,
            sample_rate: metadata.sample_rate,
            channels: metadata.channels,
            codec: metadata.codec,
            mimetype: metadata.mimetype || 'audio/mpeg',
            ...metadata,
          },
        })
        .eq('id', track.id);

      if (updateError) {
        console.error(`   ❌ Error updating track ${trackId}:`, updateError.message);
        errors++;
      } else {
        updated++;
        if (updated % 10 === 0) {
          console.log(`   ✅ Updated ${updated}/${tracks.length} tracks...`);
        }
      }
    } catch (e: any) {
      console.warn(`   ⚠️  Error processing track:`, e.message);
      errors++;
    }
  }

  console.log('\n🎉 Metadata update complete!');
  console.log(`   Total tracks: ${tracks.length}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
}

updateMetadataFromJSON().catch(console.error);
