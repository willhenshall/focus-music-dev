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

const essentialTables = [
  'audio_channels',
  'quiz_questions',
  'quiz_answers',
  'system_preferences'
];

const optionalTables = [
  'audio_tracks',
  'user_profiles',
  'user_preferences',
  'channel_recommendations',
  'image_sets',
  'image_set_images',
  'slot_strategies',
  'saved_slot_sequences'
];

async function quickExport() {
  console.log('🚀 Quick Database Export Tool\n');
  console.log('This exports essential configuration and optional user data.');
  console.log('Skip user data for a clean seed suitable for new environments.\n');

  const allTables = [...essentialTables, ...optionalTables];
  const exportData: any = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    description: 'Database seed file - essential configuration',
    essential: {},
    optional: {}
  };

  console.log('📦 Exporting essential tables...\n');

  for (const table of essentialTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*');

      if (error) {
        console.error(`   ❌ ${table}: ${error.message}`);
        continue;
      }

      exportData.essential[table] = data || [];
      console.log(`   ✓ ${table}: ${data?.length || 0} rows`);
    } catch (err: any) {
      console.error(`   ❌ ${table}: ${err.message}`);
    }
  }

  console.log('\n📦 Exporting optional tables...\n');

  for (const table of optionalTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*');

      if (error) {
        console.error(`   ⚠️  ${table}: ${error.message}`);
        exportData.optional[table] = [];
        continue;
      }

      exportData.optional[table] = data || [];
      console.log(`   ✓ ${table}: ${data?.length || 0} rows`);
    } catch (err: any) {
      console.error(`   ⚠️  ${table}: ${err.message}`);
      exportData.optional[table] = [];
    }
  }

  const essentialRows = Object.values(exportData.essential)
    .reduce((sum: number, arr: any) => sum + (arr.length || 0), 0);

  const optionalRows = Object.values(exportData.optional)
    .reduce((sum: number, arr: any) => sum + (arr.length || 0), 0);

  exportData.summary = {
    essentialTables: essentialTables.length,
    essentialRows,
    optionalTables: optionalTables.length,
    optionalRows,
    totalRows: essentialRows + optionalRows
  };

  const outputPath = path.join(process.cwd(), 'database-seed-quick.json');
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('✅ EXPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`\n📁 File: ${outputPath}`);
  console.log(`📊 Size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
  console.log(`\n📦 Essential data: ${essentialRows} rows`);
  console.log(`📦 Optional data: ${optionalRows} rows`);
  console.log(`📦 Total: ${essentialRows + optionalRows} rows\n`);

  console.log('Essential tables:');
  essentialTables.forEach(t => {
    const count = exportData.essential[t]?.length || 0;
    console.log(`   ${t.padEnd(30)} ${count.toString().padStart(6)} rows`);
  });

  console.log('\nOptional tables:');
  optionalTables.forEach(t => {
    const count = exportData.optional[t]?.length || 0;
    console.log(`   ${t.padEnd(30)} ${count.toString().padStart(6)} rows`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('💡 To import this seed: npm run import-seed-quick');
  console.log('='.repeat(60) + '\n');
}

quickExport().catch(err => {
  console.error('\n❌ Export failed:', err.message);
  process.exit(1);
});
