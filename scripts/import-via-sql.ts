import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase credentials');
}

async function executeSQLStatement(sql: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SQL execution failed: ${error}`);
  }

  return response.json();
}

async function importChannels() {
  const sqlFile = readFileSync('supabase/migrations/insert_channels.sql', 'utf-8');

  const statements = sqlFile
    .split('\n\n')
    .filter(s => s.trim() && !s.trim().startsWith('--'));

  console.log(`Found ${statements.length} SQL statements`);

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i].trim();
    if (!statement) continue;

    console.log(`Executing statement ${i + 1}/${statements.length}...`);

    try {
      await fetch(`${supabaseUrl}/rest/v1/audio_channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({})
      });

      console.log(`✓ Statement ${i + 1} executed`);
    } catch (error) {
      console.error(`✗ Statement ${i + 1} failed:`, error);
    }
  }

  console.log('\nImport complete!');
}

importChannels().catch(console.error);
