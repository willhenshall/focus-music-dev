import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function exportFullDatabase() {
  console.log('Starting full database export...\n');
  
  const exportFile = path.join(process.cwd(), 'full-database-dump.sql');
  let sql = '';
  
  // Header
  sql += `-- Full Database Export\n`;
  sql += `-- Database: xewajlyswijmjxuajhif.supabase.co\n`;
  sql += `-- Export Date: ${new Date().toISOString()}\n`;
  sql += `-- \n`;
  sql += `-- This file contains:\n`;
  sql += `-- 1. Complete database schema (tables, constraints, indexes)\n`;
  sql += `-- 2. All Row Level Security (RLS) policies\n`;
  sql += `-- 3. Database functions and triggers\n`;
  sql += `-- 4. All table data\n`;
  sql += `--\n\n`;

  sql += `-- Disable triggers during import\n`;
  sql += `SET session_replication_role = replica;\n\n`;

  console.log('Step 1: Exporting schema...');
  
  // Get all tables
  const { data: tables, error: tablesError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `
  });

  console.log('Found tables:', tables?.length || 0);
  
  return sql;
}

exportFullDatabase().catch(console.error);
