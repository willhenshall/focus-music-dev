import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testCDNSync() {
  console.log('🧪 Testing CDN Sync Edge Function\n');

  // Get a random track from the database that has a file
  console.log('1. Finding a test track with audio file...');
  const { data: tracks, error: findError } = await supabase
    .from('audio_tracks')
    .select('track_id, file_path, cdn_url, track_name')
    .is('deleted_at', null)
    .not('file_path', 'is', null)
    .limit(1);

  if (findError || !tracks || tracks.length === 0) {
    console.error('❌ Failed to find test track:', findError);
    return;
  }

  const testTrack = tracks[0];
  console.log(`✅ Found test track: ${testTrack.track_name} (ID: ${testTrack.track_id})`);
  console.log(`   File path: ${testTrack.file_path}`);
  console.log(`   Current CDN URL: ${testTrack.cdn_url || 'None'}\n`);

  // Call the sync-to-cdn Edge Function
  console.log('2. Calling CDN sync Edge Function...');
  const response = await fetch(
    `${supabaseUrl}/functions/v1/sync-to-cdn`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackId: testTrack.track_id,
        operation: 'upload',
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Edge Function failed:', response.status, error);
    return;
  }

  const result = await response.json();
  console.log('✅ Edge Function response:', JSON.stringify(result, null, 2));

  // Verify database was updated
  console.log('\n3. Verifying database was updated...');
  const { data: updatedTrack, error: verifyError } = await supabase
    .from('audio_tracks')
    .select('track_id, cdn_url, cdn_uploaded_at, storage_locations')
    .eq('track_id', testTrack.track_id)
    .maybeSingle();

  if (verifyError || !updatedTrack) {
    console.error('❌ Failed to verify database update:', verifyError);
    return;
  }

  console.log('✅ Database updated successfully:');
  console.log(`   CDN URL: ${updatedTrack.cdn_url}`);
  console.log(`   CDN Uploaded At: ${updatedTrack.cdn_uploaded_at}`);
  console.log(`   Storage Locations:`, JSON.stringify(updatedTrack.storage_locations, null, 2));

  // Verify files are accessible on CDN
  console.log('\n4. Verifying files are accessible on CDN...');

  if (result.cdn_url) {
    console.log(`   Testing audio file: ${result.cdn_url}`);
    const audioResponse = await fetch(result.cdn_url, { method: 'HEAD' });
    if (audioResponse.ok) {
      console.log(`   ✅ Audio file accessible (${audioResponse.headers.get('content-length')} bytes)`);
    } else {
      console.log(`   ❌ Audio file not accessible: ${audioResponse.status}`);
    }
  }

  if (result.sidecar_cdn_url) {
    console.log(`   Testing metadata file: ${result.sidecar_cdn_url}`);
    const metadataResponse = await fetch(result.sidecar_cdn_url, { method: 'HEAD' });
    if (metadataResponse.ok) {
      console.log(`   ✅ Metadata file accessible (${metadataResponse.headers.get('content-length')} bytes)`);
    } else {
      console.log(`   ❌ Metadata file not accessible: ${metadataResponse.status}`);
    }
  }

  console.log('\n✅ CDN Sync test complete!');
  console.log('\nExpected CDN paths:');
  console.log(`   Audio: https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/${testTrack.track_id}.mp3`);
  console.log(`   Metadata: https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/metadata/${testTrack.track_id}.json`);
}

testCDNSync().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
