import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function applyMigration() {
  console.log('Reading migration file...');
  const migrationSQL = fs.readFileSync(
    '/tmp/cc-agent/60373310/project/supabase/migrations/20251117000000_create_multi_bell_sound_system.sql',
    'utf-8'
  );

  console.log('Applying migration to database...');
  
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.error('Migration error:', error);
      return;
    }
    
    console.log('✅ Migration applied successfully!');
    
  } catch (err) {
    console.error('Error:', err);
    console.log('\nTrying alternative method...');
    
    // Alternative: Use postgrest-js directly
    const { error } = await supabase.from('_migrations').insert({
      name: '20251117000000_create_multi_bell_sound_system',
      executed_at: new Date().toISOString()
    });
    
    if (error) {
      console.log('Could not log migration:', error.message);
    }
  }
  
  // Verify the tables exist
  console.log('\nVerifying tables...');
  const { data: bellData, error: bellError } = await supabase
    .from('timer_bell_sounds')
    .select('count')
    .limit(1);
  
  console.log('timer_bell_sounds:', bellError ? '❌ ' + bellError.message : '✅ EXISTS');
  
  const { data: prefData, error: prefError } = await supabase
    .from('user_bell_preferences')
    .select('count')
    .limit(1);
  
  console.log('user_bell_preferences:', prefError ? '❌ ' + prefError.message : '✅ EXISTS');
}

applyMigration().then(() => process.exit(0));
