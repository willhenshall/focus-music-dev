import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function getAudioTracksSchema() {
  const { data: sample } = await supabase.from('audio_tracks').select('*').limit(1).single();

  if (!sample) {
    console.log('No data found');
    return;
  }

  console.log('AUDIO_TRACKS COLUMN SCHEMA:\n');
  console.log('Column Name'.padEnd(30) + 'Type'.padEnd(20) + 'Include');
  console.log('='.repeat(70));

  const columns = Object.keys(sample).sort();

  const includedColumns: Array<{ column: string; type: string }> = [];

  columns.forEach(col => {
    const value = sample[col];
    const type = typeof value;
    const isObject = type === 'object' && value !== null && !Array.isArray(value);
    const isArray = Array.isArray(value);
    const isNull = value === null;

    let displayType = type;
    if (isNull) displayType = 'null';
    else if (isArray) displayType = 'array';
    else if (isObject) displayType = 'json/object';

    // Determine JavaScript/SQL type
    let jsType = 'text';
    if (type === 'number') jsType = 'number';
    else if (type === 'boolean') jsType = 'boolean';
    else if (type === 'string' && value && value.match(/^\d{4}-\d{2}-\d{2}/)) jsType = 'datetime';

    // Exclude metadata (JSON), cdn_sync_status, and other complex objects
    const include = !isObject && col !== 'metadata';

    console.log(
      col.padEnd(30) +
      displayType.padEnd(20) +
      (include ? '✓ YES' : '✗ NO')
    );

    if (include) {
      includedColumns.push({ column: col, type: jsType });
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log(`\nTotal Columns: ${columns.length}`);
  console.log(`Included: ${includedColumns.length}`);
  console.log(`Excluded: ${columns.length - includedColumns.length}`);

  console.log('\n\nGENERATED METADATA_FIELDS ARRAY:\n');
  console.log('const METADATA_FIELDS = [');

  includedColumns.forEach(({ column, type }) => {
    const label = column
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    console.log(`  { value: '${column}', label: '${label}', type: '${type}' },`);
  });

  console.log('];');
}

getAudioTracksSchema();
