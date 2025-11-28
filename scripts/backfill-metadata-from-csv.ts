import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface CSVRow {
  track_id: number;
  track_name: string;
  artist_name: string;
  album_name: string;
  duration: number;
  tempo: number;
  catalog: string;
  locked: boolean;
  track_user_genre_id: number;
  speed: number;
  intensity: number;
  arousal: number;
  valence: number;
  brightness: number;
  complexity: number;
  music_key_value: number;
  energy_set: number;
}

function parseCSV(filePath: string): CSVRow[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  const rows: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());

    if (values.length < headers.length) continue;

    const row: any = {};
    headers.forEach((header, idx) => {
      const value = values[idx];

      // Map CSV header to our field names
      if (header === 'energy set') {
        row['energy_set'] = value ? parseInt(value) : null;
      } else {
        const key = header.replace(/ /g, '_');
        row[key] = value;
      }
    });

    // Convert types
    rows.push({
      track_id: parseInt(row.track_id),
      track_name: row.track_name || '',
      artist_name: row.artist_name || '',
      album_name: row.album_name || '',
      duration: parseFloat(row.duration) || 0,
      tempo: parseInt(row.tempo) || 0,
      catalog: row.catalog || '',
      locked: row.locked === '1' || row.locked === 'true',
      track_user_genre_id: parseInt(row.track_user_genre_id) || 0,
      speed: parseFloat(row.speed) || 0,
      intensity: parseFloat(row.intensity) || 0,
      arousal: parseFloat(row.arousal) || 0,
      valence: parseFloat(row.valence) || 0,
      brightness: parseFloat(row.brightness) || 0,
      complexity: parseFloat(row.complexity) || 0,
      music_key_value: parseInt(row.music_key_value) || 0,
      energy_set: parseInt(row.energy_set) || 0
    });
  }

  return rows;
}

async function backfillMetadata() {
  console.log('🎵 Starting metadata backfill process...\n');

  // Parse the CSV file
  console.log('📖 Reading CSV file...');
  const csvData = parseCSV('/tmp/metadata_backfill.csv');
  console.log(`✅ Parsed ${csvData.length} rows from CSV\n`);

  // Create temp table and load data
  console.log('📋 Creating temporary table...');
  const { error: createError } = await supabase.rpc('backfill_track_metadata' as any);

  // Since we can't directly create temp tables, we'll use a different approach
  // We'll update records in batches using direct SQL

  console.log('🔄 Starting batch updates...');
  let updatedCount = 0;
  const batchSize = 100;

  for (let i = 0; i < csvData.length; i += batchSize) {
    const batch = csvData.slice(i, i + batchSize);

    console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(csvData.length / batchSize)}...`);

    for (const row of batch) {
      try {
        // Find the track by track_id in metadata
        const { data: tracks, error: findError } = await supabase
          .from('audio_tracks')
          .select('id, metadata, tempo, catalog, locked, speed, intensity, arousal, valence, brightness, complexity, music_key_value, energy_set, track_id')
          .eq('deleted_at', null)
          .filter('metadata->>track_id', 'eq', row.track_id.toString())
          .limit(1);

        if (findError) {
          console.error(`Error finding track ${row.track_id}:`, findError);
          continue;
        }

        if (!tracks || tracks.length === 0) {
          // Track not found, skip
          continue;
        }

        const track = tracks[0];

        // Build update object - only update NULL fields
        const updates: any = {
          track_id: track.track_id ?? row.track_id,
          tempo: track.tempo ?? row.tempo,
          catalog: track.catalog ?? row.catalog,
          locked: track.locked ?? row.locked,
          track_user_genre_id: (track.metadata as any)?.track_user_genre_id ?? row.track_user_genre_id,
          speed: track.speed ?? row.speed,
          intensity: track.intensity ?? row.intensity,
          arousal: track.arousal ?? row.arousal,
          valence: track.valence ?? row.valence,
          brightness: track.brightness ?? row.brightness,
          complexity: track.complexity ?? row.complexity,
          music_key_value: track.music_key_value ?? row.music_key_value,
          energy_set: track.energy_set ?? row.energy_set
        };

        // Update metadata JSONB
        const existingMetadata = track.metadata || {};
        updates.metadata = {
          ...existingMetadata,
          artist_name: (existingMetadata as any).artist_name || row.artist_name,
          album: (existingMetadata as any).album || row.album_name,
          track_name: (existingMetadata as any).track_name || row.track_name,
          track_id: row.track_id.toString()
        };

        // Update the track
        const { error: updateError } = await supabase
          .from('audio_tracks')
          .update(updates)
          .eq('id', track.id);

        if (updateError) {
          console.error(`Error updating track ${row.track_id}:`, updateError);
          continue;
        }

        updatedCount++;
      } catch (err) {
        console.error(`Error processing track ${row.track_id}:`, err);
      }
    }

    console.log(`  ✅ Processed ${Math.min((i + batchSize), csvData.length)}/${csvData.length} records (${updatedCount} updated)\n`);
  }

  console.log(`\n✅ Backfill complete! Updated ${updatedCount} tracks with metadata from CSV.`);

  // Show summary statistics
  const { data: stats } = await supabase.rpc('execute_sql' as any, {
    query: `
      SELECT
        COUNT(*) as total_tracks,
        COUNT(track_id) as has_track_id,
        COUNT(tempo) as has_tempo,
        COUNT(catalog) as has_catalog,
        COUNT(speed) as has_speed,
        COUNT(intensity) as has_intensity,
        COUNT(arousal) as has_arousal,
        COUNT(valence) as has_valence,
        COUNT(brightness) as has_brightness,
        COUNT(complexity) as has_complexity,
        COUNT(music_key_value) as has_music_key_value,
        COUNT(energy_set) as has_energy_set
      FROM audio_tracks
      WHERE deleted_at IS NULL;
    `
  });

  console.log('\n📊 Final Statistics:');
  if (stats && stats.length > 0) {
    console.log(JSON.stringify(stats[0], null, 2));
  }
}

backfillMetadata().catch(console.error);
