import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing credentials in .env.test');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSql(sql: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      // If RPC doesn't work, try direct SQL execution via pg
      const { error } = await supabase.rpc('exec', { sql });
      if (error) {
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function setupTestDatabase() {
  console.log('\n🔧 Setting up test database...\n');
  console.log('Test Database URL:', supabaseUrl);
  console.log('');

  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');

  // Get all schema migrations (skip data population scripts)
  const allFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const schemaMigrations = allFiles.filter(file => {
    const skipPatterns = [
      'populate_audio_tracks',
      'populate_all_tracks',
      'bulk_insert_tracks',
      'update_tracks_from_sidecars',
      'update_all_track_metadata',
      'update_track_metadata_from_storage',
      'populate_from_uploaded',
      'insert_channels_part_',
      'import_audio_channels',
      'apply_metadata_backfill',
      'extract_version',
    ];

    return !skipPatterns.some(pattern => file.includes(pattern));
  });

  console.log(`Found ${allFiles.length} total migrations`);
  console.log(`Applying ${schemaMigrations.length} schema migrations`);
  console.log(`Skipping ${allFiles.length - schemaMigrations.length} data population scripts\n`);

  let applied = 0;
  let failed = 0;
  const errors: Array<{ file: string; error: string }> = [];

  for (const file of schemaMigrations) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    process.stdout.write(`📝 ${file}... `);

    const result = await executeSql(sql);

    if (result.success) {
      console.log('✓');
      applied++;
    } else {
      console.log('❌');
      failed++;
      errors.push({ file, error: result.error || 'Unknown error' });
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✓ Applied: ${applied}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(70) + '\n');

  if (errors.length > 0) {
    console.log('⚠️  Errors encountered:\n');
    errors.forEach(({ file, error }) => {
      console.log(`  ${file}`);
      console.log(`    └─ ${error}\n`);
    });
    console.log('\n💡 You may need to apply failed migrations manually at:');
    console.log(`   ${supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/')}/sql\n`);
  } else {
    console.log('✅ Test database schema setup complete!');
    console.log('\n📊 Next step: Run `npm run seed-test-db` to populate test data\n');
  }
}

setupTestDatabase().catch((err) => {
  console.error('\n❌ Setup failed:', err);
  process.exit(1);
});
