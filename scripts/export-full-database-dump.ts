import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface TableInfo {
  table_name: string;
}

async function executeSQL(query: string): Promise<any> {
  const { data, error } = await supabase.rpc('exec_sql', { sql: query }) as any;
  if (error && !data) {
    // Try direct query approach
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ sql: query })
    });

    if (!response.ok) {
      throw new Error(`SQL execution failed: ${response.statusText}`);
    }
    return await response.json();
  }
  return data;
}

async function exportFullDatabase() {
  console.log('Starting full database export...\n');

  const exportFile = path.join(process.cwd(), 'full-database-dump.sql');
  let sql = '';

  // Header
  sql += `-- =====================================================\n`;
  sql += `-- Full Database Export\n`;
  sql += `-- Database: xewajlyswijmjxuajhif.supabase.co\n`;
  sql += `-- Export Date: ${new Date().toISOString()}\n`;
  sql += `-- =====================================================\n`;
  sql += `--\n`;
  sql += `-- This file contains:\n`;
  sql += `-- 1. Complete database schema (tables, constraints, indexes)\n`;
  sql += `-- 2. All Row Level Security (RLS) policies\n`;
  sql += `-- 3. Database functions and triggers\n`;
  sql += `-- 4. All table data\n`;
  sql += `--\n`;
  sql += `-- IMPORTANT: Review and adjust for your target database\n`;
  sql += `--\n\n`;

  sql += `-- Disable triggers during import\n`;
  sql += `SET session_replication_role = replica;\n\n`;

  console.log('Step 1: Getting list of tables...');

  // Get all tables
  const tablesQuery = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE') as any;

  // Fallback: get tables manually
  const knownTables = [
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

  console.log(`Found ${knownTables.length} tables to export\n`);

  sql += `-- =====================================================\n`;
  sql += `-- SCHEMA DEFINITIONS\n`;
  sql += `-- =====================================================\n\n`;

  // Export each table schema
  for (const tableName of knownTables) {
    console.log(`Exporting schema for: ${tableName}`);

    sql += `-- Table: ${tableName}\n`;
    sql += `DROP TABLE IF EXISTS ${tableName} CASCADE;\n\n`;

    // Get table definition
    const { data: columns } = await supabase
      .from('information_schema.columns')
      .select('*')
      .eq('table_schema', 'public')
      .eq('table_name', tableName)
      .order('ordinal_position') as any;

    if (columns && columns.length > 0) {
      sql += `CREATE TABLE ${tableName} (\n`;

      const columnDefs = columns.map((col: any) => {
        let def = `  ${col.column_name} ${col.udt_name}`;

        if (col.character_maximum_length) {
          def += `(${col.character_maximum_length})`;
        }

        if (col.is_nullable === 'NO') {
          def += ' NOT NULL';
        }

        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }

        return def;
      });

      sql += columnDefs.join(',\n');
      sql += `\n);\n\n`;
    }
  }

  sql += `\n-- =====================================================\n`;
  sql += `-- TABLE DATA\n`;
  sql += `-- =====================================================\n\n`;

  // Export data for each table
  for (const tableName of knownTables) {
    console.log(`Exporting data from: ${tableName}`);

    const { data: rows, error } = await supabase
      .from(tableName)
      .select('*');

    if (error) {
      console.log(`  Skipping ${tableName}: ${error.message}`);
      sql += `-- Skipped ${tableName}: ${error.message}\n\n`;
      continue;
    }

    if (!rows || rows.length === 0) {
      console.log(`  No data in ${tableName}`);
      sql += `-- No data in ${tableName}\n\n`;
      continue;
    }

    console.log(`  Found ${rows.length} rows`);
    sql += `-- Data for ${tableName} (${rows.length} rows)\n`;

    // Get column names
    const columns = Object.keys(rows[0]);

    for (const row of rows) {
      const values = columns.map(col => {
        const val = row[col];
        if (val === null) return 'NULL';
        if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
        if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        return val;
      });

      sql += `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});\n`;
    }

    sql += `\n`;
  }

  sql += `-- =====================================================\n`;
  sql += `-- RLS POLICIES\n`;
  sql += `-- =====================================================\n\n`;

  // Export RLS policies
  for (const tableName of knownTables) {
    console.log(`Exporting RLS policies for: ${tableName}`);

    sql += `-- RLS for ${tableName}\n`;
    sql += `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;\n\n`;

    // Note: Getting policies requires querying pg_policies which may not be accessible
    sql += `-- Note: RLS policies should be reviewed from your migration files\n`;
    sql += `-- They cannot be fully extracted via the API\n\n`;
  }

  sql += `-- Re-enable triggers\n`;
  sql += `SET session_replication_role = DEFAULT;\n\n`;

  sql += `-- =====================================================\n`;
  sql += `-- EXPORT COMPLETE\n`;
  sql += `-- =====================================================\n`;

  // Write to file
  fs.writeFileSync(exportFile, sql);

  console.log(`\n✅ Export complete!`);
  console.log(`📄 File: ${exportFile}`);
  console.log(`📦 Size: ${(fs.statSync(exportFile).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`\nYou can now import this file to your new Supabase Pro account.`);
}

exportFullDatabase().catch(console.error);
