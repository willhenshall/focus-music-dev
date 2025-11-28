import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('🔧 Applying track_id sequence migration...\n');

  // Step 1: Create sequence
  console.log('Step 1: Creating atomic sequence...');
  const { error: seqError } = await supabase.rpc('exec_sql', {
    sql: `
      DO $$
      DECLARE
        max_track_id INTEGER;
      BEGIN
        SELECT COALESCE(MAX(track_id), 179094) INTO max_track_id
        FROM audio_tracks
        WHERE track_id IS NOT NULL;

        DROP SEQUENCE IF EXISTS audio_tracks_track_id_seq;
        EXECUTE format('CREATE SEQUENCE audio_tracks_track_id_seq START WITH %s', max_track_id + 1);

        RAISE NOTICE 'Created sequence starting at: %', max_track_id + 1;
      END $$;
    `
  });

  if (seqError) {
    console.error('❌ Failed to create sequence:', seqError);

    // Try direct approach without exec_sql wrapper
    console.log('Trying direct SQL execution...');
    const { data: maxData, error: maxError } = await supabase
      .from('audio_tracks')
      .select('track_id')
      .not('track_id', 'is', null)
      .order('track_id', { ascending: false })
      .limit(1)
      .single();

    if (maxError && maxError.code !== 'PGRST116') {
      console.error('Failed to get max track_id:', maxError);
      return;
    }

    const maxId = maxData?.track_id || 179094;
    console.log(`Current max track_id: ${maxId}`);
    console.log(`Next track_id will be: ${maxId + 1}`);
  } else {
    console.log('✅ Sequence created successfully');
  }

  // Step 2: Create function
  console.log('\nStep 2: Creating get_next_track_id() function...');
  const createFunctionSQL = `
    DROP FUNCTION IF EXISTS get_next_track_id();

    CREATE FUNCTION get_next_track_id()
    RETURNS INTEGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      next_id INTEGER;
    BEGIN
      SELECT nextval('audio_tracks_track_id_seq')::INTEGER INTO next_id;
      RETURN next_id;
    END;
    $$;

    GRANT EXECUTE ON FUNCTION get_next_track_id() TO authenticated;
    GRANT EXECUTE ON FUNCTION get_next_track_id() TO anon;

    COMMENT ON FUNCTION get_next_track_id() IS
      'Atomically generates next unique track_id using PostgreSQL sequence. '
      'Eliminates race conditions in concurrent uploads.';
  `;

  console.log('\n📋 SQL to run in Supabase Dashboard SQL Editor:');
  console.log('=' .repeat(80));
  console.log(createFunctionSQL);
  console.log('=' .repeat(80));

  console.log('\n⚠️  Please run the above SQL in your Supabase Dashboard:');
  console.log('   1. Go to https://supabase.com/dashboard');
  console.log('   2. Select your project');
  console.log('   3. Go to SQL Editor');
  console.log('   4. Copy and paste the SQL above');
  console.log('   5. Click "Run"');

  console.log('\n✅ Migration preparation complete!');
}

applyMigration().catch(console.error);
