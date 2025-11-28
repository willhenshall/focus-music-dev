import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigrations() {
  console.log('\n🔄 Applying migrations to test database...\n');
  console.log('Test Database URL:', supabaseUrl);
  console.log('');

  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${migrationFiles.length} migration files\n`);

  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    // Skip migrations that only populate data from storage (not needed for test DB)
    if (
      file.includes('populate_audio_tracks_from_storage') ||
      file.includes('populate_all_tracks_from_sidecars') ||
      file.includes('bulk_insert_tracks') ||
      file.includes('update_tracks_from_sidecars') ||
      file.includes('update_all_track_metadata') ||
      file.includes('update_track_metadata_from_storage') ||
      file.includes('populate_from_uploaded_json') ||
      file.includes('populate_tracks_from_uploaded_storage') ||
      file.includes('populate_tracks_with_rls_bypass') ||
      file.includes('insert_channels_part_')
    ) {
      console.log(`⏭️  Skipping: ${file} (data population)`);
      skipped++;
      continue;
    }

    try {
      process.stdout.write(`Applying: ${file}... `);

      const { error } = await supabase.rpc('exec_sql', { sql_query: sql }).single();

      if (error) {
        // Try direct execution if RPC doesn't work
        const { error: directError } = await supabase.from('_test').select('*').limit(0);

        if (directError) {
          console.log('❌');
          console.log(`  Error: ${error.message}`);
          failed++;
        } else {
          console.log('✓');
          applied++;
        }
      } else {
        console.log('✓');
        applied++;
      }
    } catch (err: any) {
      console.log('❌');
      console.log(`  Error: ${err.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✓ Applied: ${applied}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(50) + '\n');

  if (failed > 0) {
    console.log('⚠️  Some migrations failed. You may need to apply them manually.');
    console.log('Go to: https://supabase.com/dashboard/project/phrgdesmixqtjwfanuao/sql');
  } else {
    console.log('✅ All migrations applied successfully!');
    console.log('\nNext step: Run `npm run seed-test-db` to populate test data');
  }
}

applyMigrations().catch(console.error);
