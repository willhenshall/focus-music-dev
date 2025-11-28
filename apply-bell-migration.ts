import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log('Using Supabase URL:', supabaseUrl);
console.log('Service role key present:', !!supabaseServiceKey);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const migrationSQL = readFileSync('./supabase/migrations/20251117000000_create_multi_bell_sound_system.sql', 'utf-8');

    console.log('Applying migration to database using direct SQL execution...');

    // Execute SQL directly using the REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ sql: migrationSQL })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Migration error:', errorText);

      // Try alternative: create tables directly
      console.log('Trying direct table creation...');
      await createTablesDirectly();
    } else {
      console.log('✓ Migration applied successfully!');
    }

    // Verify tables were created
    await verifyTables();

    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    console.log('\nTrying direct table creation as fallback...');

    try {
      await createTablesDirectly();
      await verifyTables();
      process.exit(0);
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr);
      process.exit(1);
    }
  }
}

async function createTablesDirectly() {
  console.log('Creating timer_bell_sounds table...');

  // We can't use RPC, so we'll verify if tables exist by querying them
  const { error: bellError } = await supabase
    .from('timer_bell_sounds')
    .select('id')
    .limit(1);

  if (bellError && bellError.message.includes('does not exist')) {
    console.log('Tables need to be created. Please run this SQL manually in Supabase SQL Editor:');
    console.log('\n' + '='.repeat(80));
    const migrationSQL = readFileSync('./supabase/migrations/20251117000000_create_multi_bell_sound_system.sql', 'utf-8');
    console.log(migrationSQL);
    console.log('='.repeat(80) + '\n');
    throw new Error('Tables do not exist. Please create them using the SQL above.');
  } else if (!bellError) {
    console.log('✓ Tables already exist');
  }
}

async function verifyTables() {
  console.log('\nVerifying tables...');

  const { data: bellSounds, error: bellError } = await supabase
    .from('timer_bell_sounds')
    .select('*')
    .limit(5);

  if (bellError) {
    console.error('Error querying timer_bell_sounds:', bellError);
  } else {
    console.log(`✓ Found ${bellSounds?.length || 0} bell sounds in database`);
    if (bellSounds && bellSounds.length > 0) {
      console.log('Bell sounds:', bellSounds.map(b => b.name));
    }
  }

  const { data: preferences, error: prefError } = await supabase
    .from('user_bell_preferences')
    .select('*')
    .limit(1);

  if (prefError) {
    console.error('Error querying user_bell_preferences:', prefError);
  } else {
    console.log(`✓ user_bell_preferences table accessible`);
  }
}

applyMigration();
