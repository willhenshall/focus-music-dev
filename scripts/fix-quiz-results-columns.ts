import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function fixQuizResultsColumns() {
  console.log('🔧 Fixing quiz_results table columns...\n');

  // Split the migration into individual ALTER TABLE statements
  const migrations = [
    {
      name: 'Add brain_type_primary',
      sql: `ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS brain_type_primary text;`
    },
    {
      name: 'Add brain_type_secondary',
      sql: `ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS brain_type_secondary text;`
    },
    {
      name: 'Add brain_type_scores',
      sql: `ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS brain_type_scores jsonb DEFAULT '{}'::jsonb;`
    },
    {
      name: 'Add adhd_indicator',
      sql: `ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS adhd_indicator numeric;`
    },
    {
      name: 'Add asd_score',
      sql: `ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS asd_score numeric;`
    },
    {
      name: 'Add preferred_stimulant_level',
      sql: `ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS preferred_stimulant_level text;`
    }
  ];

  // Try executing through a custom function or raw RPC
  for (const migration of migrations) {
    console.log(`Executing: ${migration.name}...`);

    // Use the SQL editor approach - send raw SQL
    const response = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_raw_sql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!}`
        },
        body: JSON.stringify({ sql: migration.sql })
      }
    );

    if (!response.ok) {
      console.log(`  ⚠️  HTTP ${response.status}: ${response.statusText}`);
      const text = await response.text();
      console.log(`  Response: ${text.substring(0, 200)}`);
    } else {
      console.log(`  ✓ ${migration.name} added`);
    }
  }

  // Now verify by attempting a full quiz result insert
  console.log('\n📋 Verifying columns by attempting test insert...\n');

  const testData = {
    user_id: '00000000-0000-0000-0000-000000000001',
    quiz_version: '2.0',
    responses: {},
    ocean_scores: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5
    },
    brain_type_primary: 'balanced',
    brain_type_secondary: 'explorer',
    brain_type_scores: { balanced: 0.8 },
    adhd_indicator: 3,
    asd_score: 1.5,
    preferred_stimulant_level: 'medium',
    recommended_channels: []
  };

  const { data, error } = await supabase
    .from('quiz_results')
    .insert(testData)
    .select();

  if (error) {
    if (error.message.includes('does not exist')) {
      console.log('❌ FAILED: Column still missing');
      console.log('Error:', error.message);
      console.log('\n⚠️  The columns could not be added via API.');
      console.log('You need to run this SQL directly in Supabase Dashboard > SQL Editor:\n');
      console.log('--- COPY THIS SQL ---');
      console.log(`
ALTER TABLE quiz_results
  ADD COLUMN IF NOT EXISTS brain_type_primary text,
  ADD COLUMN IF NOT EXISTS brain_type_secondary text,
  ADD COLUMN IF NOT EXISTS brain_type_scores jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS adhd_indicator numeric,
  ADD COLUMN IF NOT EXISTS asd_score numeric,
  ADD COLUMN IF NOT EXISTS preferred_stimulant_level text;
      `);
      console.log('--- END SQL ---\n');
    } else if (error.message.includes('violates')) {
      console.log('✅ SUCCESS: All columns exist!');
      console.log('(RLS policy blocked test insert - this is expected)');
    } else {
      console.log('Test result:', error.message);
    }
  } else {
    console.log('✅ SUCCESS: All columns exist and working!');
    console.log('Test data inserted:', data);

    // Clean up test data
    await supabase
      .from('quiz_results')
      .delete()
      .eq('user_id', '00000000-0000-0000-0000-000000000001');
    console.log('Test data cleaned up.');
  }

  console.log('\n✅ Fix attempt complete. If columns are still missing, use SQL Editor in Supabase Dashboard.');
}

fixQuizResultsColumns().catch(console.error);
