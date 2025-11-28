import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || ''
);

/**
 * Test Script for Metadata Refactoring
 *
 * This script verifies that all metadata JSONB queries have been
 * successfully replaced with direct column references.
 */

async function testQueries() {
  console.log('🔍 Testing Metadata Refactoring Queries...\n');

  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Query by track_id (was metadata->>track_id)
  console.log('Test 1: Query by track_id column...');
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, track_id, track_name, artist_name')
      .not('track_id', 'is', null)
      .limit(5);

    if (error) throw error;
    console.log(`✅ PASS - Retrieved ${data.length} tracks by track_id`);
    console.log(`   Sample: ${data[0]?.track_name} by ${data[0]?.artist_name}`);
    passedTests++;
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 2: Search by track_name (was metadata->>track_name)
  console.log('\nTest 2: Search by track_name column...');
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, track_name, artist_name')
      .ilike('track_name', '%the%')
      .is('deleted_at', null)
      .limit(3);

    if (error) throw error;
    console.log(`✅ PASS - Found ${data.length} tracks matching search`);
    passedTests++;
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 3: Search by artist_name (was metadata->>artist_name)
  console.log('\nTest 3: Search by artist_name column...');
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, track_name, artist_name')
      .not('artist_name', 'is', null)
      .is('deleted_at', null)
      .limit(3);

    if (error) throw error;
    console.log(`✅ PASS - Found ${data.length} tracks with artist names`);
    passedTests++;
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 4: Filter by genre (was metadata->>genre)
  console.log('\nTest 4: Filter by genre column...');
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, track_name, genre')
      .not('genre', 'is', null)
      .is('deleted_at', null)
      .limit(3);

    if (error) throw error;
    console.log(`✅ PASS - Found ${data.length} tracks with genre`);
    console.log(`   Sample genre: ${data[0]?.genre}`);
    passedTests++;
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 5: Order by track_name (was metadata->track_name)
  console.log('\nTest 5: Order by track_name...');
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, track_name')
      .not('track_name', 'is', null)
      .is('deleted_at', null)
      .order('track_name')
      .limit(3);

    if (error) throw error;
    console.log(`✅ PASS - Ordered ${data.length} tracks by name`);
    console.log(`   First: ${data[0]?.track_name}`);
    passedTests++;
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 6: Filter by tempo (was metadata->>tempo or metadata->>bpm)
  console.log('\nTest 6: Filter by tempo column...');
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, track_name, tempo')
      .not('tempo', 'is', null)
      .is('deleted_at', null)
      .limit(3);

    if (error) throw error;
    console.log(`✅ PASS - Found ${data.length} tracks with tempo`);
    console.log(`   Sample tempo: ${data[0]?.tempo} BPM`);
    passedTests++;
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 7: Complex OR search (multiple top-level columns)
  console.log('\nTest 7: Complex OR search across columns...');
  try {
    const searchTerm = 'music';
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, track_name, artist_name, genre')
      .or(`track_name.ilike.%${searchTerm}%,artist_name.ilike.%${searchTerm}%,genre.ilike.%${searchTerm}%`)
      .is('deleted_at', null)
      .limit(5);

    if (error) throw error;
    console.log(`✅ PASS - Complex search found ${data.length} tracks`);
    passedTests++;
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 8: IN clause with track_id array
  console.log('\nTest 8: IN clause with track_id array...');
  try {
    // First get some track IDs
    const { data: sampleTracks } = await supabase
      .from('audio_tracks')
      .select('track_id')
      .not('track_id', 'is', null)
      .limit(3);

    if (sampleTracks && sampleTracks.length > 0) {
      const trackIds = sampleTracks.map(t => t.track_id).filter(Boolean);

      const { data, error } = await supabase
        .from('audio_tracks')
        .select('id, track_id, track_name')
        .in('track_id', trackIds);

      if (error) throw error;
      console.log(`✅ PASS - IN clause retrieved ${data.length} tracks`);
      passedTests++;
    } else {
      throw new Error('No sample tracks available');
    }
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 9: Verify metadata-only fields still work (album_name, file_size, source)
  console.log('\nTest 9: Verify metadata-only fields (album_name, file_size, source)...');
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, metadata')
      .not('metadata', 'is', null)
      .limit(3);

    if (error) throw error;

    const hasMetadataFields = data.some(track =>
      track.metadata?.album_name ||
      track.metadata?.file_size ||
      track.metadata?.source
    );

    if (hasMetadataFields) {
      console.log(`✅ PASS - Metadata-only fields still accessible`);
      passedTests++;
    } else {
      throw new Error('No metadata-only fields found');
    }
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Test 10: Top-level audio metrics (speed, intensity, brightness, etc.)
  console.log('\nTest 10: Query top-level audio metrics...');
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('id, track_name, speed, intensity, brightness, complexity, valence, arousal')
      .not('speed', 'is', null)
      .is('deleted_at', null)
      .limit(3);

    if (error) throw error;
    console.log(`✅ PASS - Retrieved ${data.length} tracks with audio metrics`);
    if (data[0]) {
      console.log(`   Sample: Speed=${data[0].speed}, Intensity=${data[0].intensity}`);
    }
    passedTests++;
  } catch (err: any) {
    console.log(`❌ FAIL - ${err.message}`);
    failedTests++;
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);

  if (failedTests === 0) {
    console.log('\n🎉 All tests passed! Metadata refactoring is successful.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }
}

testQueries().catch(console.error);
