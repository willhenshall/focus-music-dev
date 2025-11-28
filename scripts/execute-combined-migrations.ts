import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function executeCombinedMigrations() {
  console.log('\n🚀 Executing combined migrations on test database...\n');
  console.log('Database:', supabaseUrl, '\n');

  const sqlPath = '/tmp/combined_migrations.sql';

  if (!fs.existsSync(sqlPath)) {
    console.error('❌ Combined migrations file not found!');
    console.log('Run: ./scripts/apply-test-db-migrations.sh first\n');
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // Split into individual statements at migration boundaries for better error reporting
  const migrations = sql.split(/-- Migration: /).filter(Boolean);

  console.log(`Found ${migrations.length} migrations to apply\n`);

  let applied = 0;
  let failed = 0;

  for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i];
    const match = migration.match(/^(\S+)/);
    const filename = match ? match[1] : `migration_${i + 1}`;

    process.stdout.write(`[${i + 1}/${migrations.length}] ${filename}... `);

    try {
      // Execute SQL directly through Supabase client
      const {error } = await supabase.rpc('exec', { sql: migration });

      if (error) {
        console.log('❌');
        console.log(`   Error: ${error.message}\n`);
        failed++;
      } else {
        console.log('✓');
        applied++;
      }
    } catch (err: any) {
      console.log('❌');
      console.log(`   Error: ${err.message}\n`);
      failed++;
    }

    // Small delay to avoid overwhelming the database
    if (i < migrations.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✓ Applied: ${applied}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('='.repeat(70) + '\n');

  if (failed > 0) {
    console.log('⚠️  Some migrations failed. You may need to:');
    console.log('  1. Check the errors above');
    console.log('  2. Apply failed migrations manually in SQL Editor');
    console.log(`  3. Go to: https://supabase.com/dashboard/project/phrgdesmixqtjwfanuao/sql\n`);
  } else {
    console.log('✅ All migrations applied successfully!');
    console.log('\n📊 Next step: Run `npm run seed-test-db` to populate test data\n');
  }
}

executeCombinedMigrations().catch((err) => {
  console.error('\n❌ Execution failed:', err);
  process.exit(1);
});
