import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TableData {
  table: string;
  rowCount: number;
  data: any[];
}

interface SeedData {
  exportedAt: string;
  version: string;
  description: string;
  tables: TableData[];
  summary: any;
}

async function importAllData() {
  console.log('Starting database import...\n');

  const seedPath = path.join(process.cwd(), 'database-seed-complete.json');

  if (!fs.existsSync(seedPath)) {
    console.error(`Error: Seed file not found at ${seedPath}`);
    process.exit(1);
  }

  const seedData: SeedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

  console.log('Seed file loaded:');
  console.log(`  Version: ${seedData.version}`);
  console.log(`  Exported: ${seedData.exportedAt}`);
  console.log(`  Total rows: ${seedData.summary.totalRows}`);
  console.log(`  Total tables: ${seedData.summary.totalTables}\n`);

  const results = {
    successful: [] as string[],
    failed: [] as string[],
    totalInserted: 0
  };

  for (const tableData of seedData.tables) {
    const { table, data, rowCount } = tableData;

    if (rowCount === 0) {
      console.log(`Skipping ${table} (no data)`);
      results.successful.push(table);
      continue;
    }

    try {
      console.log(`Importing ${table} (${rowCount} rows)...`);

      const batchSize = 100;
      let inserted = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        const { error } = await supabase
          .from(table)
          .upsert(batch, { onConflict: 'id' });

        if (error) {
          throw error;
        }

        inserted += batch.length;
        const progress = Math.round((inserted / rowCount) * 100);
        process.stdout.write(`\r  Progress: ${progress}% (${inserted}/${rowCount})`);
      }

      console.log(`\n  ✓ Successfully imported ${inserted} rows into ${table}`);
      results.successful.push(table);
      results.totalInserted += inserted;

    } catch (err: any) {
      console.error(`\n  ✗ Failed to import ${table}: ${err.message}`);
      results.failed.push(table);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('DATABASE IMPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nSuccessfully imported: ${results.successful.length} tables`);
  console.log(`Failed to import: ${results.failed.length} tables`);
  console.log(`Total rows inserted: ${results.totalInserted}`);

  if (results.failed.length > 0) {
    console.log('\nFailed tables:');
    results.failed.forEach(t => console.log(`  - ${t}`));
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

importAllData().catch(console.error);
