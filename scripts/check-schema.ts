import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSchema() {
  const { data: sample } = await supabase
    .from('audio_tracks')
    .select('*')
    .limit(1)
    .single();

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  AUDIO_TRACKS TABLE SCHEMA');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const columns = Object.keys(sample!).sort();

  console.log('Column Name           Type          Sample Value');
  console.log('───────────────────────────────────────────────────────────────────');

  columns.forEach(key => {
    const value = sample![key];
    const type = typeof value;
    let example = value !== null ? String(value) : 'NULL';
    if (type === 'string' && example.length > 40) {
      example = example.substring(0, 37) + '...';
    }
    console.log(`${key.padEnd(22)}${type.padEnd(14)}${example}`);
  });

  console.log('\n' + columns.length + ' total columns\n');

  console.log('NEW METADATA COLUMNS (recently added):');
  console.log('  • track_name');
  console.log('  • artist_name');
  console.log('  • genre');
  console.log('  • track_id');
}

checkSchema();
