import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

async function testDeletion() {
  console.log('🔍 Testing CDN deletion display bug...\n');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Find a track that's synced to CDN
  const { data: tracks, error: fetchError } = await supabase
    .from('audio_tracks')
    .select('track_id, track_name, cdn_url, storage_locations, deleted_at')
    .not('cdn_url', 'is', null)
    .is('deleted_at', null)
    .limit(1);

  if (fetchError || !tracks || tracks.length === 0) {
    console.log('❌ No CDN-synced tracks found to test');
    console.log('Creating a mock deletion scenario instead...\n');

    // Test with a track that doesn't exist on CDN
    const { data: anyTrack } = await supabase
      .from('audio_tracks')
      .select('track_id, track_name, cdn_url, storage_locations')
      .is('deleted_at', null)
      .limit(1)
      .single();

    if (!anyTrack) {
      console.log('❌ No tracks found at all');
      return;
    }

    console.log(`📝 Test track: ${anyTrack.track_name} (ID: ${anyTrack.track_id})`);
    console.log(`   CDN URL: ${anyTrack.cdn_url || 'Not synced'}`);
    console.log(`   Storage locations:`, anyTrack.storage_locations);
    console.log('\n⚠️  This track is not on CDN, so we expect:');
    console.log('   - Backend should skip CDN deletion gracefully');
    console.log('   - UI should show "0 deleted" with success status\n');
  } else {
    const track = tracks[0];
    console.log(`📝 Found CDN-synced track: ${track.track_name} (ID: ${track.track_id})`);
    console.log(`   CDN URL: ${track.cdn_url}`);
    console.log(`   Storage locations:`, track.storage_locations);
    console.log('\n⚠️  This will actually delete the track! Testing in 3 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Call the permanently-delete-tracks function
  console.log('🚀 Calling permanently-delete-tracks...\n');

  // Get track ID from either CDN-synced tracks or any track
  let trackIds: number[] = [];
  if (tracks && tracks.length > 0) {
    trackIds = [tracks[0].track_id];
  } else {
    // Fallback to any track for testing
    const { data: anyTrack } = await supabase
      .from('audio_tracks')
      .select('track_id')
      .is('deleted_at', null)
      .limit(1)
      .single();

    if (anyTrack) {
      trackIds = [anyTrack.track_id];
    }
  }

  if (trackIds.length === 0) {
    console.log('❌ No track IDs to delete');
    return;
  }

  const apiUrl = `${supabaseUrl}/functions/v1/permanently-delete-tracks`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trackIds }),
    });

    console.log(`📡 Response Status: ${response.status} ${response.statusText}`);

    const result = await response.json();

    console.log('\n📋 Full Response:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.details) {
      console.log('\n✅ Deletion completed');
      console.log('\n🎯 CDN Deletion Details:');
      console.log(`   Files Deleted: ${result.details.cdnFilesDeleted}`);
      console.log(`   Files Failed: ${result.details.cdnDeletionFailed}`);
      console.log(`   Total Tracks: ${result.details.tracksDeleted}`);

      console.log('\n🖥️  UI Display Logic:');
      console.log(`   Status: ${result.details.cdnDeletionFailed > 0 ? '❌ error' : '✅ success'}`);
      console.log(`   Text: "${result.details.cdnFilesDeleted} deleted${result.details.cdnDeletionFailed ? ` (${result.details.cdnDeletionFailed} failed)` : ''}"`);

      if (result.details.cdnDeletionFailed > 0) {
        console.log('\n❌ BUG REPRODUCED: CDN shows as failed');
        console.log('   Errors:', result.details.errors?.filter((e: string) => e.includes('CDN')));
      } else {
        console.log('\n✅ BUG FIXED: CDN shows as successful');
      }
    }

    // Check edge function logs by looking at the response structure
    console.log('\n🔍 Diagnostic Analysis:');
    if (result.details?.cdnDeletionFailed > 0) {
      console.log('   The permanently-delete-tracks function is counting CDN deletions as failed');
      console.log('   This means sync-to-cdn either:');
      console.log('     1. Returned HTTP error status (not 200)');
      console.log('     2. Returned { success: false } or { verified: false }');
      console.log('     3. Returned { details.audioFile.deleted: false } or { details.metadataFile.deleted: false }');
      console.log('\n   Check sync-to-cdn logs for:');
      console.log('     - "CDN Response Status: XXX"');
      console.log('     - "CDN Result for track XXX: {...}"');
    }

  } catch (error: any) {
    console.error('\n❌ Error calling function:', error.message);
  }
}

testDeletion().catch(console.error);
