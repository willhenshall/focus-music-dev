import { readFileSync } from 'fs';

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

async function generateBackfillSQL() {
  console.log('🎵 Generating metadata backfill SQL...\n');

  // Parse the CSV file
  console.log('📖 Reading CSV file...');
  const csvData = parseCSV('/tmp/metadata_backfill.csv');
  console.log(`✅ Parsed ${csvData.length} rows from CSV\n`);

  console.log('🔧 Building SQL update statement...');

  // We'll create smaller batches and output each as a separate SQL file
  const batchSize = 500;

  for (let i = 0; i < csvData.length; i += batchSize) {
    const batch = csvData.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(csvData.length / batchSize);

    console.log(`\n📦 Generating batch ${batchNum}/${totalBatches} (${batch.length} records)...`);

    const batchSQL = `
-- Batch ${batchNum}/${totalBatches}: Backfill metadata for tracks ${batch[0].track_id} to ${batch[batch.length - 1].track_id}
UPDATE audio_tracks
SET
  track_id = COALESCE(track_id, (metadata->>'track_id')::INTEGER),
  tempo = COALESCE(tempo, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.tempo}`).join('\n    ')}
  END),
  catalog = COALESCE(catalog, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${escapeSQL(row.catalog)}`).join('\n    ')}
  END),
  speed = COALESCE(speed, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.speed}`).join('\n    ')}
  END),
  intensity = COALESCE(intensity, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.intensity}`).join('\n    ')}
  END),
  arousal = COALESCE(arousal, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.arousal}`).join('\n    ')}
  END),
  valence = COALESCE(valence, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.valence}`).join('\n    ')}
  END),
  brightness = COALESCE(brightness, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.brightness}`).join('\n    ')}
  END),
  complexity = COALESCE(complexity, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.complexity}`).join('\n    ')}
  END),
  music_key_value = COALESCE(music_key_value, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.music_key_value}`).join('\n    ')}
  END),
  energy_set = COALESCE(energy_set, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.energy_set}`).join('\n    ')}
  END),
  track_user_genre_id = COALESCE(track_user_genre_id, CASE (metadata->>'track_id')::INTEGER
    ${batch.map(row => `WHEN ${row.track_id} THEN ${row.track_user_genre_id}`).join('\n    ')}
  END)
  -- NOTE: We do NOT update artist_name, album, or track_name in metadata
  -- These fields are preserved as-is to maintain existing display names
WHERE deleted_at IS NULL
  AND (metadata->>'track_id')::INTEGER IN (${batch.map(r => r.track_id).join(',')});
`;

    // Write to file
    const filename = `/tmp/backfill_batch_${batchNum.toString().padStart(2, '0')}.sql`;
    const fs = await import('fs');
    fs.writeFileSync(filename, batchSQL);
    console.log(`  ✅ Generated ${filename} (${(batchSQL.length / 1024).toFixed(2)} KB)`);
  }

  console.log(`\n✅ Generated ${Math.ceil(csvData.length / batchSize)} SQL batch files in /tmp/`);
  console.log('\nTo apply these, you can run them via mcp__supabase__execute_sql');
}

generateBackfillSQL().catch(console.error);
