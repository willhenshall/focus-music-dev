import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function executeSQLStatements() {
  const migrationSQL = fs.readFileSync(
    '/tmp/cc-agent/60373310/project/supabase/migrations/20251117000000_create_multi_bell_sound_system.sql',
    'utf-8'
  );

  // Split into individual statements and execute separately
  // Remove comments and split by semicolons
  const cleanSQL = migrationSQL
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');

  console.log('Creating tables...');

  // Execute key statements manually
  const statements = [
    // Create timer_bell_sounds table
    `CREATE TABLE IF NOT EXISTS timer_bell_sounds (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      storage_path text,
      public_url text,
      file_size integer,
      format text,
      duration numeric(6,2),
      is_visible boolean DEFAULT true,
      sort_order integer DEFAULT 0,
      is_default boolean DEFAULT false,
      uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`,

    // Create user_bell_preferences table
    `CREATE TABLE IF NOT EXISTS user_bell_preferences (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
      bell_sound_id uuid REFERENCES timer_bell_sounds(id) ON DELETE SET NULL,
      volume integer DEFAULT 80 CHECK (volume >= 0 AND volume <= 100),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(user_id)
    )`,

    // Create storage bucket
    `INSERT INTO storage.buckets (id, name, public)
     VALUES ('timer-bell', 'timer-bell', true)
     ON CONFLICT (id) DO NOTHING`,

    // Insert default bell
    `INSERT INTO timer_bell_sounds (name, storage_path, public_url, is_visible, sort_order, is_default, format)
     SELECT 'Built-in Bell (Default)', NULL, NULL, true, 999, true, 'programmatic'
     WHERE NOT EXISTS (SELECT 1 FROM timer_bell_sounds WHERE name = 'Built-in Bell (Default)')`
  ];

  for (const [index, stmt] of statements.entries()) {
    console.log(`Executing statement ${index + 1}/${statements.length}...`);
    const { error } = await supabase.rpc('exec', { sql: stmt }).catch(() => ({ error: { message: 'RPC not available' } }));
    
    if (error && error.message !== 'RPC not available') {
      console.log(`Statement ${index + 1} error:`, error.message);
    }
  }

  // Verify
  console.log('\nVerifying setup...');
  const check1 = await supabase.from('timer_bell_sounds').select('id').limit(1);
  const check2 = await supabase.from('user_bell_preferences').select('id').limit(1);
  const check3 = await supabase.storage.listBuckets();

  console.log('timer_bell_sounds:', check1.error ? '❌' : '✅');
  console.log('user_bell_preferences:', check2.error ? '❌' : '✅');
  console.log('timer-bell bucket:', check3.data && check3.data.some(b => b.id === 'timer-bell') ? '✅' : '❌');
}

executeSQLStatements().then(() => process.exit(0));
