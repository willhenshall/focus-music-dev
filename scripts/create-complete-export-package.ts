/**
 * Creates a complete database export package by combining:
 * 1. All existing migration files (schema, RLS, functions)
 * 2. Current data exported from tables
 *
 * This creates a ready-to-import SQL file for your new Supabase Pro account.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config();

async function createExportPackage() {
  console.log('Creating complete database export package...\n');

  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  const outputFile = path.join(process.cwd(), 'COMPLETE_DATABASE_EXPORT.sql');

  let sql = '';

  // Header
  sql += `-- =====================================================\n`;
  sql += `-- COMPLETE DATABASE EXPORT PACKAGE\n`;
  sql += `-- Source Database: xewajlyswijmjxuajhif.supabase.co\n`;
  sql += `-- Export Date: ${new Date().toISOString()}\n`;
  sql += `-- =====================================================\n`;
  sql += `--\n`;
  sql += `-- This file contains:\n`;
  sql += `-- 1. Complete schema from all migrations\n`;
  sql += `-- 2. All RLS policies\n`;
  sql += `-- 3. All database functions and triggers\n`;
  sql += `-- 4. Data export queries (you'll need to run data export separately)\n`;
  sql += `--\n`;
  sql += `-- IMPORT INSTRUCTIONS:\n`;
  sql += `-- 1. Create a new Supabase Pro project\n`;
  sql += `-- 2. Apply this SQL file through Supabase SQL Editor\n`;
  sql += `-- 3. Run the separate data export script to populate tables\n`;
  sql += `--\n\n`;

  // Read all migration files
  console.log('📂 Reading migration files...');

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`   Found ${migrationFiles.length} migration files\n`);

  sql += `-- =====================================================\n`;
  sql += `-- PART 1: SCHEMA MIGRATIONS\n`;
  sql += `-- =====================================================\n`;
  sql += `-- Total Migrations: ${migrationFiles.length}\n`;
  sql += `-- =====================================================\n\n`;

  // Combine all migrations
  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    sql += `-- =====================================================\n`;
    sql += `-- Migration: ${file}\n`;
    sql += `-- =====================================================\n\n`;
    sql += content;
    sql += `\n\n`;
  }

  sql += `\n-- =====================================================\n`;
  sql += `-- PART 2: DATA EXPORT INSTRUCTIONS\n`;
  sql += `-- =====================================================\n`;
  sql += `--\n`;
  sql += `-- NOTE: Data export through Supabase JS client is restricted.\n`;
  sql += `-- You have two options:\n`;
  sql += `--\n`;
  sql += `-- OPTION 1: Use Supabase Studio (Recommended)\n`;
  sql += `--   1. Go to https://supabase.com/dashboard/project/xewajlyswijmjxuajhif\n`;
  sql += `--   2. Navigate to Table Editor\n`;
  sql += `--   3. For each table, export to CSV\n`;
  sql += `--   4. Import CSVs to your new project\n`;
  sql += `--\n`;
  sql += `-- OPTION 2: Use pg_dump (if you have direct PostgreSQL access)\n`;
  sql += `--   Contact Supabase support to get connection details for pg_dump\n`;
  sql += `--\n`;
  sql += `-- OPTION 3: Manual data migration\n`;
  sql += `--   If you have critical data, consider writing a custom migration\n`;
  sql += `--   script that reads from old DB and writes to new DB\n`;
  sql += `--\n\n`;

  // List all tables that need data export
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

  sql += `-- Tables requiring data export (${tables.length} total):\n`;
  tables.forEach(table => {
    sql += `-- - ${table}\n`;
  });
  sql += `\n\n`;

  sql += `-- =====================================================\n`;
  sql += `-- EXPORT COMPLETE\n`;
  sql += `-- =====================================================\n`;

  // Write to file
  fs.writeFileSync(outputFile, sql);

  const stats = fs.statSync(outputFile);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log(`✅ Export package created!`);
  console.log(`📄 File: ${outputFile}`);
  console.log(`📦 Size: ${sizeMB} MB`);
  console.log(`📋 Migrations included: ${migrationFiles.length}`);
  console.log(`📊 Tables listed: ${tables.length}`);
  console.log(`\n` + '='.repeat(60));
  console.log('NEXT STEPS:');
  console.log('='.repeat(60));
  console.log(`\n1. ✅ Use ${path.basename(outputFile)} to create schema in new DB`);
  console.log(`\n2. 📊 Export data using Supabase Studio:`);
  console.log(`   - Visit: https://supabase.com/dashboard/project/xewajlyswijmjxuajhif`);
  console.log(`   - Go to Table Editor`);
  console.log(`   - Export each table as CSV`);
  console.log(`   - Import CSVs to new project`);
  console.log(`\n3. 🔐 Review RLS policies in new database`);
  console.log(`\n4. 🧪 Test thoroughly before switching production traffic`);
}

createExportPackage().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
