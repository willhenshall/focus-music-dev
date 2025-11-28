import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables!');
  process.exit(1);
}

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

function escapeSQL(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  // Escape single quotes
  return `'${value.toString().replace(/'/g, "''")}'`;
}

async function backfillMetadata() {
  console.log('🎵 Starting metadata backfill process...\n');

  // Parse the CSV file
  console.log('📖 Reading CSV file...');
  const csvData = parseCSV('/tmp/metadata_backfill.csv');
  console.log(`✅ Parsed ${csvData.length} rows from CSV\n`);

  // Build SQL statement for bulk update using CASE statements
  console.log('🔧 Building SQL update statement...');

  const updateSQL = `
    UPDATE audio_tracks
    SET
      track_id = CASE
        WHEN track_id IS NOT NULL THEN track_id
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.track_id}`).join('\n            ')}
          END
        )
        ELSE track_id
      END,
      tempo = CASE
        WHEN tempo IS NOT NULL THEN tempo
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.tempo}`).join('\n            ')}
          END
        )
        ELSE tempo
      END,
      catalog = CASE
        WHEN catalog IS NOT NULL THEN catalog
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(row.catalog)}`).join('\n            ')}
          END
        )
        ELSE catalog
      END,
      speed = CASE
        WHEN speed IS NOT NULL THEN speed
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.speed}`).join('\n            ')}
          END
        )
        ELSE speed
      END,
      intensity = CASE
        WHEN intensity IS NOT NULL THEN intensity
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.intensity}`).join('\n            ')}
          END
        )
        ELSE intensity
      END,
      arousal = CASE
        WHEN arousal IS NOT NULL THEN arousal
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.arousal}`).join('\n            ')}
          END
        )
        ELSE arousal
      END,
      valence = CASE
        WHEN valence IS NOT NULL THEN valence
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.valence}`).join('\n            ')}
          END
        )
        ELSE valence
      END,
      brightness = CASE
        WHEN brightness IS NOT NULL THEN brightness
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.brightness}`).join('\n            ')}
          END
        )
        ELSE brightness
      END,
      complexity = CASE
        WHEN complexity IS NOT NULL THEN complexity
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.complexity}`).join('\n            ')}
          END
        )
        ELSE complexity
      END,
      music_key_value = CASE
        WHEN music_key_value IS NOT NULL THEN music_key_value
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.music_key_value}`).join('\n            ')}
          END
        )
        ELSE music_key_value
      END,
      energy_set = CASE
        WHEN energy_set IS NOT NULL THEN energy_set
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.energy_set}`).join('\n            ')}
          END
        )
        ELSE energy_set
      END,
      track_user_genre_id = CASE
        WHEN track_user_genre_id IS NOT NULL THEN track_user_genre_id
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          CASE (metadata->>'track_id')::INTEGER
            ${csvData.map(row => `WHEN ${row.track_id} THEN ${row.track_user_genre_id}`).join('\n            ')}
          END
        )
        ELSE track_user_genre_id
      END,
      metadata = CASE
        WHEN (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')}) THEN (
          jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{artist_name}',
                CASE (metadata->>'track_id')::INTEGER
                  ${csvData.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(JSON.stringify(row.artist_name))}`).join('\n                  ')}
                END::jsonb,
                true
              ),
              '{album}',
              CASE (metadata->>'track_id')::INTEGER
                ${csvData.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(JSON.stringify(row.album_name))}`).join('\n                ')}
              END::jsonb,
              true
            ),
            '{track_name}',
            CASE (metadata->>'track_id')::INTEGER
              ${csvData.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(JSON.stringify(row.track_name))}`).join('\n              ')}
            END::jsonb,
            true
          )
        )
        ELSE metadata
      END
    WHERE deleted_at IS NULL
      AND (metadata->>'track_id')::INTEGER IN (${csvData.map(r => r.track_id).join(',')});
  `;

  console.log('SQL statement size:', (updateSQL.length / 1024).toFixed(2), 'KB');

  // The SQL is too large for a single query, let's batch it
  const batchSize = 500;
  let updatedCount = 0;

  for (let i = 0; i < csvData.length; i += batchSize) {
    const batch = csvData.slice(i, i + batchSize);
    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(csvData.length / batchSize)} (${batch.length} records)...`);

    const batchSQL = `
      UPDATE audio_tracks
      SET
        track_id = COALESCE(track_id, (metadata->>'track_id')::INTEGER),
        tempo = COALESCE(tempo, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.tempo}`).join('\n          ')}
        END),
        catalog = COALESCE(catalog, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(row.catalog)}`).join('\n          ')}
        END),
        speed = COALESCE(speed, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.speed}`).join('\n          ')}
        END),
        intensity = COALESCE(intensity, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.intensity}`).join('\n          ')}
        END),
        arousal = COALESCE(arousal, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.arousal}`).join('\n          ')}
        END),
        valence = COALESCE(valence, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.valence}`).join('\n          ')}
        END),
        brightness = COALESCE(brightness, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.brightness}`).join('\n          ')}
        END),
        complexity = COALESCE(complexity, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.complexity}`).join('\n          ')}
        END),
        music_key_value = COALESCE(music_key_value, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.music_key_value}`).join('\n          ')}
        END),
        energy_set = COALESCE(energy_set, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.energy_set}`).join('\n          ')}
        END),
        track_user_genre_id = COALESCE(track_user_genre_id, CASE (metadata->>'track_id')::INTEGER
          ${batch.map(row => `WHEN ${row.track_id} THEN ${row.track_user_genre_id}`).join('\n          ')}
        END),
        metadata = CASE
          WHEN (metadata->>'track_id')::INTEGER IN (${batch.map(r => r.track_id).join(',')}) THEN
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  COALESCE(metadata, '{}'::jsonb),
                  '{artist_name}',
                  to_jsonb(COALESCE(metadata->>'artist_name', CASE (metadata->>'track_id')::INTEGER
                    ${batch.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(row.artist_name)}`).join('\n                    ')}
                  END)),
                  true
                ),
                '{album}',
                to_jsonb(COALESCE(metadata->>'album', CASE (metadata->>'track_id')::INTEGER
                  ${batch.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(row.album_name)}`).join('\n                  ')}
                END)),
                true
              ),
              '{track_name}',
              to_jsonb(COALESCE(metadata->>'track_name', CASE (metadata->>'track_id')::INTEGER
                ${batch.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(row.track_name)}`).join('\n                ')}
              END)),
              true
            )
          ELSE metadata
        END
      WHERE deleted_at IS NULL
        AND (metadata->>'track_id')::INTEGER IN (${batch.map(r => r.track_id).join(',')});
    `;

    try {
      const { error, count } = await supabase.rpc('execute_sql' as any, {
        query: batchSQL
      });

      if (error) {
        console.error('❌ Error executing batch:', error);
        console.log('First 500 chars of SQL:', batchSQL.substring(0, 500));
        continue;
      }

      updatedCount += count || 0;
      console.log(`  ✅ Batch complete (${updatedCount} total updated so far)`);
    } catch (err) {
      console.error('❌ Exception executing batch:', err);
      continue;
    }
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
    const s = stats[0] as any;
    console.log(`  Total tracks: ${s.total_tracks}`);
    console.log(`  Has track_id: ${s.has_track_id} (${((s.has_track_id / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has tempo: ${s.has_tempo} (${((s.has_tempo / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has catalog: ${s.has_catalog} (${((s.has_catalog / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has speed: ${s.has_speed} (${((s.has_speed / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has intensity: ${s.has_intensity} (${((s.has_intensity / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has arousal: ${s.has_arousal} (${((s.has_arousal / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has valence: ${s.has_valence} (${((s.has_valence / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has brightness: ${s.has_brightness} (${((s.has_brightness / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has complexity: ${s.has_complexity} (${((s.has_complexity / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has music_key_value: ${s.has_music_key_value} (${((s.has_music_key_value / s.total_tracks) * 100).toFixed(1)}%)`);
    console.log(`  Has energy_set: ${s.has_energy_set} (${((s.has_energy_set / s.total_tracks) * 100).toFixed(1)}%)`);
  }
}

backfillMetadata().catch(console.error);
