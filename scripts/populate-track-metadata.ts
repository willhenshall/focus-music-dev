import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function populateTrackMetadata() {
  console.log('POPULATING TRACK METADATA FROM JSON SIDECARS\n');

  // Get all tracks (no limit)
  let allTracks: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: tracks, error } = await supabase
      .from('audio_tracks')
      .select('id, file_path')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching tracks:', error);
      return;
    }

    if (!tracks || tracks.length === 0) break;

    allTracks = allTracks.concat(tracks);
    page++;

    if (tracks.length < pageSize) break;
  }

  const tracks = allTracks;

  console.log(`Processing ${tracks.length} tracks...\n`);

  let processed = 0;
  let updated = 0;
  let errors = 0;

  for (const track of tracks) {
    try {
      // Extract track ID from file_path
      const match = track.file_path.match(/\/(\d+)\.mp3$/);
      if (!match) {
        processed++;
        continue;
      }

      const trackId = match[1];
      const jsonFile = `${trackId}.json`;

      // Download JSON sidecar
      const { data: jsonData, error: downloadError } = await supabase.storage
        .from('audio-sidecars')
        .download(jsonFile);

      if (downloadError || !jsonData) {
        processed++;
        continue;
      }

      const text = await jsonData.text();
      const json = JSON.parse(text);
      const metadata = json.metadata;

      // Update track with metadata
      const { error: updateError } = await supabase
        .from('audio_tracks')
        .update({
          track_id: metadata.track_id || trackId,
          track_name: metadata.track_name || null,
          artist_name: metadata.artist_name || null,
          genre: metadata.genre_category || null
        })
        .eq('id', track.id);

      if (updateError) {
        errors++;
      } else {
        updated++;
      }

      processed++;

      if (processed % 100 === 0) {
        console.log(`Processed: ${processed}, Updated: ${updated}, Errors: ${errors}`);
      }
    } catch (err) {
      errors++;
      processed++;
    }
  }

  console.log('\n✅ COMPLETE');
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
}

populateTrackMetadata();
