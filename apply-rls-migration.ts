import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function applyMigration() {
  const sql = readFileSync('supabase/migrations/20251028000000_fix_rls_performance_issues.sql', 'utf-8');

  // Split by policy blocks
  const statements = sql
    .split(/(?=DROP POLICY IF EXISTS)/g)
    .filter(s => s.trim() && !s.startsWith('/*'));

  console.log(`Applying ${statements.length} policy updates...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt) continue;

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: stmt }) as any;

      if (error) {
        console.error(`Error in statement ${i + 1}:`, error.message);
        errorCount++;
      } else {
        successCount++;
        if (successCount % 10 === 0) {
          console.log(`Progress: ${successCount}/${statements.length}`);
        }
      }
    } catch (e: any) {
      console.error(`Exception in statement ${i + 1}:`, e.message);
      errorCount++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

applyMigration();
