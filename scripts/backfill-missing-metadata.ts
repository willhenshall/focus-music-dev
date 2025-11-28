import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

interface BackfillStats {
  track_name: number;
  artist_name: number;
  genre: number;
  track_id: number;
  tempo: number;
  speed: number;
  intensity: number;
  arousal: number;
  valence: number;
  brightness: number;
  complexity: number;
  music_key_value: number;
}

const stats: BackfillStats = {
  track_name: 0,
  artist_name: 0,
  genre: 0,
  track_id: 0,
  tempo: 0,
  speed: 0,
  intensity: 0,
  arousal: 0,
  valence: 0,
  brightness: 0,
  complexity: 0,
  music_key_value: 0
};

async function backfillMissingMetadata() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DATABASE BACKFILL OPERATION - NULL VALUES ONLY');
  console.log('═══════════════════════════════════════════════════════\n');

  // Fetch all records with at least one NULL in target columns
  console.log('Fetching records with missing metadata...\n');

  let allTracks: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: tracks, error } = await supabase
      .from('audio_tracks')
      .select('id, file_path, track_name, artist_name, genre, track_id, tempo, speed, intensity, arousal, valence, brightness, complexity, music_key_value')
      .order('id')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error fetching tracks:', error);
      return;
    }

    if (!tracks || tracks.length === 0) break;

    // Filter to only tracks with at least one NULL value
    const tracksWithNulls = tracks.filter(t =>
      t.track_name === null ||
      t.artist_name === null ||
      t.genre === null ||
      t.track_id === null ||
      t.tempo === null ||
      t.speed === null ||
      t.intensity === null ||
      t.arousal === null ||
      t.valence === null ||
      t.brightness === null ||
      t.complexity === null ||
      t.music_key_value === null
    );

    allTracks = allTracks.concat(tracksWithNulls);
    page++;

    if (tracks.length < pageSize) break;
  }

  console.log(`Found ${allTracks.length} records with missing metadata\n`);
  console.log('Starting backfill process...\n');

  let processed = 0;
  let updated = 0;
  let errors = 0;
  let noJsonFound = 0;

  for (const track of allTracks) {
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
        noJsonFound++;
        processed++;
        continue;
      }

      const text = await jsonData.text();
      const json = JSON.parse(text);
      const metadata = json.metadata;

      // Build update object - ONLY for NULL values
      const updates: any = {};
      let hasUpdates = false;

      if (track.track_name === null && metadata.track_name) {
        updates.track_name = metadata.track_name;
        stats.track_name++;
        hasUpdates = true;
      }

      if (track.artist_name === null && metadata.artist_name) {
        updates.artist_name = metadata.artist_name;
        stats.artist_name++;
        hasUpdates = true;
      }

      if (track.genre === null && metadata.genre_category) {
        updates.genre = metadata.genre_category;
        stats.genre++;
        hasUpdates = true;
      }

      if (track.track_id === null && (metadata.track_id || trackId)) {
        updates.track_id = metadata.track_id || trackId;
        stats.track_id++;
        hasUpdates = true;
      }

      if (track.tempo === null && metadata.tempo !== undefined) {
        updates.tempo = metadata.tempo;
        stats.tempo++;
        hasUpdates = true;
      }

      if (track.speed === null && metadata.speed !== undefined) {
        updates.speed = metadata.speed;
        stats.speed++;
        hasUpdates = true;
      }

      if (track.intensity === null && metadata.intensity !== undefined) {
        updates.intensity = metadata.intensity;
        stats.intensity++;
        hasUpdates = true;
      }

      if (track.arousal === null && metadata.arousal !== undefined) {
        updates.arousal = metadata.arousal;
        stats.arousal++;
        hasUpdates = true;
      }

      if (track.valence === null && metadata.valence !== undefined) {
        updates.valence = metadata.valence;
        stats.valence++;
        hasUpdates = true;
      }

      if (track.brightness === null && metadata.brightness !== undefined) {
        updates.brightness = metadata.brightness;
        stats.brightness++;
        hasUpdates = true;
      }

      if (track.complexity === null && metadata.complexity !== undefined) {
        updates.complexity = metadata.complexity;
        stats.complexity++;
        hasUpdates = true;
      }

      if (track.music_key_value === null && metadata.music_key_value !== undefined) {
        updates.music_key_value = metadata.music_key_value;
        stats.music_key_value++;
        hasUpdates = true;
      }

      // Only update if we have changes
      if (hasUpdates) {
        const { error: updateError } = await supabase
          .from('audio_tracks')
          .update(updates)
          .eq('id', track.id);

        if (updateError) {
          errors++;
        } else {
          updated++;
        }
      }

      processed++;

      if (processed % 50 === 0) {
        console.log(`Progress: ${processed}/${allTracks.length} | Updated: ${updated} | Errors: ${errors} | No JSON: ${noJsonFound}`);
      }
    } catch (err) {
      errors++;
      processed++;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  BACKFILL OPERATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Total processed: ${processed}`);
  console.log(`Records updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`No JSON found: ${noJsonFound}\n`);

  console.log('FIELDS BACKFILLED:\n');
  console.log(`  track_name:       ${stats.track_name} values added`);
  console.log(`  artist_name:      ${stats.artist_name} values added`);
  console.log(`  genre:            ${stats.genre} values added`);
  console.log(`  track_id:         ${stats.track_id} values added`);
  console.log(`  tempo:            ${stats.tempo} values added`);
  console.log(`  speed:            ${stats.speed} values added`);
  console.log(`  intensity:        ${stats.intensity} values added`);
  console.log(`  arousal:          ${stats.arousal} values added`);
  console.log(`  valence:          ${stats.valence} values added`);
  console.log(`  brightness:       ${stats.brightness} values added`);
  console.log(`  complexity:       ${stats.complexity} values added`);
  console.log(`  music_key_value:  ${stats.music_key_value} values added`);
}

backfillMissingMetadata();
