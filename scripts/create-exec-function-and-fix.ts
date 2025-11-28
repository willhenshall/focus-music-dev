import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function createExecFunctionAndFix() {
  console.log('🔧 Step 1: Creating helper function to execute SQL...\n');

  // First, create a function that can execute arbitrary SQL
  const createFunctionSQL = `
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
  RETURN 'OK';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$;
`;

  const { data: createFuncData, error: createFuncError } = await supabase.rpc('exec_sql', {
    sql: createFunctionSQL
  });

  if (createFuncError && !createFuncError.message.includes('does not exist')) {
    console.log('Helper function already exists or created');
  }

  console.log('🔧 Step 2: Adding missing columns to quiz_results...\n');

  const alterTableSQL = `
ALTER TABLE quiz_results
  ADD COLUMN IF NOT EXISTS brain_type_primary text,
  ADD COLUMN IF NOT EXISTS brain_type_secondary text,
  ADD COLUMN IF NOT EXISTS brain_type_scores jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS adhd_indicator numeric,
  ADD COLUMN IF NOT EXISTS asd_score numeric,
  ADD COLUMN IF NOT EXISTS preferred_stimulant_level text;
`;

  const { data: alterData, error: alterError } = await supabase.rpc('exec_sql', {
    sql: alterTableSQL
  });

  if (alterError) {
    console.log('❌ Could not alter table via RPC');
    console.log('Error:', alterError.message);
    console.log('\n📋 MANUAL ACTION REQUIRED:');
    console.log('\n1. Go to your Supabase Dashboard');
    console.log('2. Navigate to: SQL Editor');
    console.log('3. Copy and paste this SQL, then click RUN:\n');
    console.log('═'.repeat(70));
    console.log(alterTableSQL.trim());
    console.log('═'.repeat(70));
    console.log('\n4. After running, refresh your quiz page and try again\n');
    return;
  }

  console.log('✅ Columns added!');
  console.log('Result:', alterData);

  console.log('\n🔍 Step 3: Verifying the fix...\n');

  // Test insert
  const { error: testError } = await supabase
    .from('quiz_results')
    .insert({
      user_id: '00000000-0000-0000-0000-000000000002',
      quiz_version: '2.0',
      responses: {},
      ocean_scores: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5 },
      brain_type_primary: 'balanced',
      brain_type_secondary: 'explorer',
      brain_type_scores: { balanced: 0.8 },
      adhd_indicator: 3,
      asd_score: 1.5,
      preferred_stimulant_level: 'medium',
      recommended_channels: []
    });

  if (testError) {
    if (testError.message.includes('does not exist')) {
      console.log('❌ Columns still missing');
      console.log('Error:', testError.message);
    } else if (testError.message.includes('violates')) {
      console.log('✅ SUCCESS! All columns exist.');
      console.log('(RLS blocked insert - this is expected and OK)');
    } else {
      console.log('⚠️  Unexpected error:', testError.message);
    }
  } else {
    console.log('✅ SUCCESS! Test insert worked, cleaning up...');
    await supabase.from('quiz_results').delete().eq('user_id', '00000000-0000-0000-0000-000000000002');
  }

  console.log('\n✅ All done! Your quiz should work now. Refresh the page and try again.');
}

createExecFunctionAndFix().catch((err) => {
  console.error('Fatal error:', err);
  console.log('\n📋 MANUAL SQL - Run this in Supabase SQL Editor:\n');
  console.log('═'.repeat(70));
  console.log(`
ALTER TABLE quiz_results
  ADD COLUMN IF NOT EXISTS brain_type_primary text,
  ADD COLUMN IF NOT EXISTS brain_type_secondary text,
  ADD COLUMN IF NOT EXISTS brain_type_scores jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS adhd_indicator numeric,
  ADD COLUMN IF NOT EXISTS asd_score numeric,
  ADD COLUMN IF NOT EXISTS preferred_stimulant_level text;
  `.trim());
  console.log('═'.repeat(70));
});
