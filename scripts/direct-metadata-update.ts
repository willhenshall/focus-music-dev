import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function updateMetadata() {
  console.log('🎵 Updating track metadata from public sidecar URLs...\n');

  let offset = 0;
  const limit = 100;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  while (true) {
    console.log(`📦 Processing batch at offset ${offset}...`);

    const { data: tracks, error: tracksError } = await supabase
      .from('audio_tracks')
      .select('id, metadata')
      .range(offset, offset + limit - 1);

    if (tracksError) {
      console.error('Error fetching tracks:', tracksError);
      break;
    }

    if (!tracks || tracks.length === 0) {
      console.log('✅ No more tracks to process');
      break;
    }

    console.log(`   Found ${tracks.length} tracks`);

    for (const track of tracks) {
      totalProcessed++;
      const trackId = track.metadata?.track_id;

      if (!trackId) {
        totalErrors++;
        continue;
      }

      try {
        // Get public URL for the sidecar file
        const { data: urlData } = supabase.storage
          .from('audio-sidecars')
          .getPublicUrl(`${trackId}.json`);

        // Fetch the JSON file directly via public URL
        const response = await fetch(urlData.publicUrl);

        if (!response.ok) {
          totalErrors++;
          continue;
        }

        const sidecarJson = await response.json();

        // Update the track metadata
        const updatedMetadata = {
          ...track.metadata,
          track_name: sidecarJson.track_name || trackId,
          artist_name: sidecarJson.artist_name || 'Focus.Music',
          duration: sidecarJson.duration || track.metadata.duration,
          duration_seconds: sidecarJson.duration_seconds || sidecarJson.duration || track.metadata.duration_seconds || 0,
          bpm: sidecarJson.bpm || track.metadata.bpm,
          key: sidecarJson.key || track.metadata.key,
          genre: sidecarJson.genre || track.metadata.genre,
        };

        const { error: updateError } = await supabase
          .from('audio_tracks')
          .update({
            metadata: updatedMetadata,
            duration_seconds: updatedMetadata.duration_seconds
          })
          .eq('id', track.id);

        if (updateError) {
          console.error(`   ❌ Error updating track ${trackId}:`, updateError.message);
          totalErrors++;
        } else {
          totalUpdated++;
        }
      } catch (e: any) {
        totalErrors++;
        if (totalProcessed % 500 === 0) {
          console.warn(`   ⚠️  Error processing track ${trackId}:`, e.message);
        }
      }

      if (totalProcessed % 100 === 0) {
        console.log(`   Progress: ${totalProcessed} processed, ${totalUpdated} updated, ${totalErrors} errors`);
      }
    }

    offset += limit;

    if (tracks.length < limit) {
      break;
    }
  }

  console.log('\n🎉 Metadata update complete!');
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Total updated: ${totalUpdated}`);
  console.log(`   Total errors: ${totalErrors}`);
}

updateMetadata().catch(console.error);
