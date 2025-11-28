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

async function updateTrackMetadata() {
  console.log('🎵 Updating track metadata from sidecar files...\n');

  let offset = 0;
  const limit = 100;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`📦 Processing batch at offset ${offset}...`);

    const { data: tracks, error: tracksError } = await supabase
      .from('audio_tracks')
      .select('id, metadata')
      .range(offset, offset + limit - 1);

    if (tracksError || !tracks || tracks.length === 0) {
      hasMore = false;
      break;
    }

    for (const track of tracks) {
      totalProcessed++;
      const trackId = track.metadata?.track_id;

      if (!trackId) continue;

      try {
        const { data: sidecarData, error: downloadError } = await supabase.storage
          .from('audio-sidecars')
          .download(`${trackId}.json`);

        if (downloadError || !sidecarData) {
          continue;
        }

        const text = await sidecarData.text();
        const sidecarMetadata = JSON.parse(text);

        const updatedMetadata = {
          track_id: trackId,
          track_name: sidecarMetadata.title || sidecarMetadata.track_name || trackId,
          artist_name: sidecarMetadata.artist || sidecarMetadata.artist_name || 'Focus.Music',
          duration: sidecarMetadata.duration,
          duration_seconds: sidecarMetadata.duration_seconds || sidecarMetadata.duration || 0,
          bpm: sidecarMetadata.bpm,
          key: sidecarMetadata.key,
          genre: sidecarMetadata.genre,
          file_size: sidecarMetadata.file_size || track.metadata?.file_size,
          mimetype: 'audio/mpeg',
        };

        const { error: updateError } = await supabase
          .from('audio_tracks')
          .update({
            metadata: updatedMetadata,
            duration_seconds: updatedMetadata.duration_seconds
          })
          .eq('id', track.id);

        if (!updateError) {
          totalUpdated++;
        }
      } catch (e: any) {
        console.warn(`   ⚠️  Error processing track ${trackId}:`, e.message);
      }

      if (totalProcessed % 50 === 0) {
        console.log(`   Progress: ${totalProcessed} processed, ${totalUpdated} updated`);
      }
    }

    offset += limit;
    if (tracks.length < limit) {
      hasMore = false;
    }
  }

  console.log('\n🎉 Metadata update complete!');
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Total updated: ${totalUpdated}`);
}

updateTrackMetadata().catch(console.error);
