import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function backfillRemaining() {
  console.log('FINAL BACKFILL PASS - REMAINING NULL VALUES\n');

  // Fetch ONLY records that still have NULLs
  const { data: tracks, error } = await supabase
    .from('audio_tracks')
    .select('id, file_path, track_name, artist_name, genre, track_id, tempo, speed, intensity, arousal, valence, brightness, complexity, music_key_value')
    .or('track_name.is.null,artist_name.is.null,genre.is.null,track_id.is.null,tempo.is.null,speed.is.null,intensity.is.null,arousal.is.null,valence.is.null,brightness.is.null,complexity.is.null,music_key_value.is.null');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Processing ${tracks.length} records with remaining NULLs\n`);

  const stats: any = {
    track_name: 0, artist_name: 0, genre: 0, track_id: 0,
    tempo: 0, speed: 0, intensity: 0, arousal: 0, valence: 0,
    brightness: 0, complexity: 0, music_key_value: 0
  };

  let processed = 0;
  let updated = 0;
  let noJson = 0;

  for (const track of tracks) {
    try {
      const match = track.file_path.match(/\/(\d+)\.mp3$/);
      if (!match) {
        processed++;
        continue;
      }

      const trackId = match[1];
      const { data: jsonData } = await supabase.storage
        .from('audio-sidecars')
        .download(`${trackId}.json`);

      if (!jsonData) {
        noJson++;
        processed++;
        continue;
      }

      const json = JSON.parse(await jsonData.text());
      const m = json.metadata;

      const updates: any = {};
      let hasUpdates = false;

      if (track.track_name === null && m.track_name) { updates.track_name = m.track_name; stats.track_name++; hasUpdates = true; }
      if (track.artist_name === null && m.artist_name) { updates.artist_name = m.artist_name; stats.artist_name++; hasUpdates = true; }
      if (track.genre === null && m.genre_category) { updates.genre = m.genre_category; stats.genre++; hasUpdates = true; }
      if (track.track_id === null) { updates.track_id = m.track_id || trackId; stats.track_id++; hasUpdates = true; }
      if (track.tempo === null && m.tempo !== undefined) { updates.tempo = m.tempo; stats.tempo++; hasUpdates = true; }
      if (track.speed === null && m.speed !== undefined) { updates.speed = m.speed; stats.speed++; hasUpdates = true; }
      if (track.intensity === null && m.intensity !== undefined) { updates.intensity = m.intensity; stats.intensity++; hasUpdates = true; }
      if (track.arousal === null && m.arousal !== undefined) { updates.arousal = m.arousal; stats.arousal++; hasUpdates = true; }
      if (track.valence === null && m.valence !== undefined) { updates.valence = m.valence; stats.valence++; hasUpdates = true; }
      if (track.brightness === null && m.brightness !== undefined) { updates.brightness = m.brightness; stats.brightness++; hasUpdates = true; }
      if (track.complexity === null && m.complexity !== undefined) { updates.complexity = m.complexity; stats.complexity++; hasUpdates = true; }
      if (track.music_key_value === null && m.music_key_value !== undefined) { updates.music_key_value = m.music_key_value; stats.music_key_value++; hasUpdates = true; }

      if (hasUpdates) {
        await supabase.from('audio_tracks').update(updates).eq('id', track.id);
        updated++;
      }

      processed++;
      if (processed % 50 === 0) {
        console.log(`Progress: ${processed}/${tracks.length} | Updated: ${updated}`);
      }
    } catch (err) {
      processed++;
    }
  }

  console.log('\n✅ FINAL PASS COMPLETE\n');
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`No JSON: ${noJson}\n`);

  Object.keys(stats).forEach(k => {
    if (stats[k] > 0) console.log(`  ${k}: ${stats[k]} values added`);
  });
}

backfillRemaining();
