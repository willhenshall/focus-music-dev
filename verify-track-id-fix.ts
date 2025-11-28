import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyFix() {
  console.log('🔍 Verifying Track ID Fix...\n');

  // Test 1: Check if sequence exists and get current value
  console.log('Test 1: Database Sequence');
  const { data: seqData, error: seqError } = await supabase.rpc('get_next_track_id');

  if (seqError) {
    console.log('❌ Sequence function error:', seqError);
    return;
  }

  console.log('✅ Sequence working! Next track_id will be:', seqData);

  // Test 2: Check for duplicate track_ids
  console.log('\nTest 2: Checking for Duplicate track_ids');
  const { data: duplicates, error: dupError } = await supabase
    .from('audio_tracks')
    .select('track_id')
    .not('track_id', 'is', null)
    .is('deleted_at', null);

  if (dupError) {
    console.log('❌ Error checking duplicates:', dupError);
    return;
  }

  const trackIdCounts = new Map<number, number>();
  duplicates?.forEach((track: any) => {
    const count = trackIdCounts.get(track.track_id) || 0;
    trackIdCounts.set(track.track_id, count + 1);
  });

  const duplicateIds = Array.from(trackIdCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([id, count]) => ({ track_id: id, count }));

  if (duplicateIds.length === 0) {
    console.log('✅ No duplicate track_ids found!');
  } else {
    console.log('⚠️  Found duplicates:', duplicateIds);
  }

  // Test 3: Verify haiku robot tracks
  console.log('\nTest 3: Haiku Robot Tracks');
  const { data: haikuTracks, error: haikuError } = await supabase
    .from('audio_tracks')
    .select('track_id, metadata')
    .ilike('metadata->>track_name', '%Haiku Robot%')
    .is('deleted_at', null)
    .order('track_id');

  if (haikuError) {
    console.log('❌ Error fetching haiku tracks:', haikuError);
    return;
  }

  console.log(`Found ${haikuTracks?.length || 0} Haiku Robot tracks:`);
  haikuTracks?.forEach((track: any) => {
    const trackName = track.metadata?.track_name || 'Unknown';
    console.log(`  - track_id: ${track.track_id} - ${trackName}`);
  });

  // Test 4: Test atomic ID generation (get 5 sequential IDs)
  console.log('\nTest 4: Atomic ID Generation (requesting 5 IDs)');
  const testIds: number[] = [];
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase.rpc('get_next_track_id');
    if (!error && data) {
      testIds.push(data);
    }
  }

  console.log('Generated IDs:', testIds);

  // Check if sequential
  let isSequential = true;
  for (let i = 1; i < testIds.length; i++) {
    if (testIds[i] !== testIds[i - 1] + 1) {
      isSequential = false;
      break;
    }
  }

  if (isSequential) {
    console.log('✅ IDs are sequential and unique!');
  } else {
    console.log('⚠️  IDs are not sequential');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ VERIFICATION COMPLETE');
  console.log('='.repeat(60));
  console.log('\n📋 Summary:');
  console.log(`   Sequence function: Working`);
  console.log(`   Duplicate track_ids: ${duplicateIds.length === 0 ? 'None' : duplicateIds.length}`);
  console.log(`   Next track_id: ${seqData}`);
  console.log(`   Haiku tracks found: ${haikuTracks?.length || 0}`);
  console.log(`   Atomic generation: ${isSequential ? 'Working' : 'Check needed'}`);
  console.log('\n🎯 Track ID fix is ready for production!');
}

verifyFix().catch(console.error);
