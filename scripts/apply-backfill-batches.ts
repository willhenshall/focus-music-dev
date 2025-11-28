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
  },
  db: {
    schema: 'public'
  }
});

async function applyBackfillBatches() {
  console.log('🎵 Applying metadata backfill batches...\n');

  const totalBatches = 23;
  let totalUpdated = 0;
  const errors: string[] = [];

  for (let i = 1; i <= totalBatches; i++) {
    const batchNum = i.toString().padStart(2, '0');
    const filename = `/tmp/backfill_batch_${batchNum}.sql`;

    console.log(`📦 Processing batch ${i}/${totalBatches}...`);

    try {
      const sql = readFileSync(filename, 'utf-8');

      // Execute via the Supabase REST API with service role
      const { data, error, count } = await supabase
        .rpc('execute_sql' as any, { query: sql });

      if (error) {
        console.error(`  ❌ Error in batch ${i}:`, error.message);
        errors.push(`Batch ${i}: ${error.message}`);
        continue;
      }

      console.log(`  ✅ Batch ${i} complete (affected ${count || 'unknown'} rows)`);
      totalUpdated += (count || 0);

    } catch (err: any) {
      console.error(`  ❌ Exception in batch ${i}:`, err.message);
      errors.push(`Batch ${i}: ${err.message}`);
      continue;
    }

    // Brief pause between batches to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   Total batches processed: ${totalBatches}`);
  console.log(`   Successful batches: ${totalBatches - errors.length}`);
  console.log(`   Failed batches: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(err => console.log(`   - ${err}`));
  }

  // Show final statistics
  console.log('\n📊 Fetching final statistics...');
  const { data: stats, error: statsError } = await supabase
    .rpc('execute_sql' as any, {
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

  if (!statsError && stats && stats.length > 0) {
    const s = stats[0] as any;
    console.log('\n📈 Final Statistics:');
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

applyBackfillBatches().catch(console.error);
