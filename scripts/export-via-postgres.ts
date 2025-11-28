import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function exportDatabase() {
  console.log('Starting PostgreSQL-based export...\n');
  console.log('Database:', supabaseUrl);

  const exportFile = path.join(process.cwd(), 'full-database-dump.sql');
  let sql = '';

  // Header
  sql += `-- =====================================================\n`;
  sql += `-- Full Database Export\n`;
  sql += `-- Source: xewajlyswijmjxuajhif.supabase.co\n`;
  sql += `-- Export Date: ${new Date().toISOString()}\n`;
  sql += `-- =====================================================\n\n`;

  // List of all tables in order (respecting dependencies)
  const tables = [
    'user_profiles',
    'audio_channels',
    'audio_tracks',
    'channel_recommendations',
    'quiz_questions',
    'quiz_answer_options',
    'quiz_results',
    'user_preferences',
    'system_preferences',
    'user_image_preferences',
    'image_sets',
    'image_set_images',
    'slot_strategies',
    'slot_strategy_slots',
    'saved_slot_sequences',
    'track_analytics',
    'user_playback_tracking',
    'test_registry',
    'test_runs'
  ];

  console.log('Exporting data from all tables using service role...\n');

  for (const tableName of tables) {
    try {
      console.log(`📦 Exporting: ${tableName}`);

      // Use service role to bypass RLS
      const { data, error, count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact' });

      if (error) {
        console.log(`   ⚠️  Error: ${error.message}`);
        sql += `-- Error exporting ${tableName}: ${error.message}\n\n`;
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`   ℹ️  No data`);
        sql += `-- No data in ${tableName}\n\n`;
        continue;
      }

      console.log(`   ✓ ${data.length} rows`);

      sql += `-- =====================================================\n`;
      sql += `-- Table: ${tableName} (${data.length} rows)\n`;
      sql += `-- =====================================================\n\n`;

      // Get column names from first row
      const columns = Object.keys(data[0]);

      // Generate INSERT statements
      for (const row of data) {
        const values = columns.map(col => {
          const val = row[col];

          if (val === null || val === undefined) {
            return 'NULL';
          }

          if (typeof val === 'boolean') {
            return val ? 'true' : 'false';
          }

          if (typeof val === 'number') {
            return String(val);
          }

          if (typeof val === 'object') {
            // Handle arrays and objects (JSONB)
            const jsonStr = JSON.stringify(val).replace(/'/g, "''");
            return `'${jsonStr}'::jsonb`;
          }

          if (typeof val === 'string') {
            // Escape single quotes
            const escaped = val.replace(/'/g, "''");
            return `'${escaped}'`;
          }

          return `'${val}'`;
        });

        sql += `INSERT INTO ${tableName} (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
      }

      sql += `\n`;

    } catch (err: any) {
      console.log(`   ❌ Exception: ${err.message}`);
      sql += `-- Exception exporting ${tableName}: ${err.message}\n\n`;
    }
  }

  sql += `\n-- =====================================================\n`;
  sql += `-- EXPORT COMPLETE\n`;
  sql += `-- Total Tables: ${tables.length}\n`;
  sql += `-- =====================================================\n`;

  // Write to file
  fs.writeFileSync(exportFile, sql);

  const stats = fs.statSync(exportFile);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log(`\n✅ Export complete!`);
  console.log(`📄 File: ${exportFile}`);
  console.log(`📦 Size: ${sizeMB} MB`);
  console.log(`\nNext steps:`);
  console.log(`1. Review the SQL file`);
  console.log(`2. Apply your schema migrations to your new Supabase Pro account first`);
  console.log(`3. Then run this SQL file to import the data`);
}

exportDatabase().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
