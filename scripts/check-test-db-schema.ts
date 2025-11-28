import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
  console.log('\nChecking test database schema...\n');
  console.log('Test Database URL:', supabaseUrl);

  const tablesToCheck = [
    'audio_channels',
    'audio_tracks',
    'user_profiles',
    'track_play_events',
    'quiz_questions',
    'slot_strategies',
  ];

  let allTablesExist = true;

  for (const table of tablesToCheck) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`❌ ${table}: Does not exist`);
        allTablesExist = false;
      } else {
        console.log(`✓ ${table}: Exists`);
      }
    } catch (err: any) {
      console.log(`❌ ${table}: Error - ${err.message}`);
      allTablesExist = false;
    }
  }

  console.log('\n' + '='.repeat(50));

  if (allTablesExist) {
    console.log('✅ Test database schema is complete!');
    console.log('\nNext step: Run `npm run seed-test-db` to populate data');
  } else {
    console.log('⚠️  Test database needs migrations applied');
    console.log('\nOptions:');
    console.log('1. Use Supabase CLI: supabase db push');
    console.log('2. Manually copy/paste migrations from supabase/migrations/ in SQL Editor');
    console.log('3. Use the migration scripts in the project');
  }
  console.log('='.repeat(50) + '\n');
}

checkSchema().catch(console.error);
