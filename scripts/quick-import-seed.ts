import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('   Make sure .env file contains VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function quickImport() {
  console.log('🚀 Quick Database Import Tool\n');

  const seedPath = path.join(process.cwd(), 'database-seed-quick.json');

  if (!fs.existsSync(seedPath)) {
    console.error(`❌ Seed file not found: ${seedPath}`);
    console.log('\n💡 Run: npm run export-seed-quick first\n');
    process.exit(1);
  }

  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  console.log('📦 Seed file loaded:');
  console.log(`   Version: ${seedData.version}`);
  console.log(`   Exported: ${seedData.exportedAt}`);
  console.log(`   Essential rows: ${seedData.summary.essentialRows}`);
  console.log(`   Optional rows: ${seedData.summary.optionalRows}\n`);

  const results = {
    successful: [] as string[],
    failed: [] as string[],
    totalInserted: 0
  };

  console.log('📥 Importing essential tables...\n');

  for (const [table, data] of Object.entries(seedData.essential)) {
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`   ⏭️  ${table}: skipped (no data)`);
      continue;
    }

    try {
      const { error } = await supabase
        .from(table)
        .upsert(data, { onConflict: 'id' });

      if (error) {
        throw error;
      }

      console.log(`   ✓ ${table}: ${data.length} rows imported`);
      results.successful.push(table);
      results.totalInserted += data.length;
    } catch (err: any) {
      console.error(`   ❌ ${table}: ${err.message}`);
      results.failed.push(table);
    }
  }

  console.log('\n📥 Importing optional tables...\n');

  for (const [table, data] of Object.entries(seedData.optional)) {
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`   ⏭️  ${table}: skipped (no data)`);
      continue;
    }

    try {
      const batchSize = 100;
      let imported = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        const { error } = await supabase
          .from(table)
          .upsert(batch, { onConflict: 'id' });

        if (error) {
          throw error;
        }

        imported += batch.length;
      }

      console.log(`   ✓ ${table}: ${imported} rows imported`);
      results.successful.push(table);
      results.totalInserted += imported;
    } catch (err: any) {
      console.error(`   ⚠️  ${table}: ${err.message} (skipped)`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ IMPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`\n✓ Successfully imported: ${results.successful.length} tables`);
  console.log(`❌ Failed to import: ${results.failed.length} tables`);
  console.log(`📊 Total rows inserted: ${results.totalInserted}`);

  if (results.failed.length > 0) {
    console.log('\n⚠️  Failed tables:');
    results.failed.forEach(t => console.log(`   - ${t}`));
  }

  console.log('\n' + '='.repeat(60));
  console.log('💡 Verify data: npm run verify-seed');
  console.log('='.repeat(60) + '\n');
}

quickImport().catch(err => {
  console.error('\n❌ Import failed:', err.message);
  process.exit(1);
});
