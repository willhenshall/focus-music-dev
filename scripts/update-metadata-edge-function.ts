import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log('Using URL:', supabaseUrl);
console.log('Using Key (first 20 chars):', supabaseServiceKey.substring(0, 20));

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateMetadata() {
  console.log('\n🎵 Testing Supabase connection...\n');

  // Test basic query
  const { data, error } = await supabase
    .from('audio_tracks')
    .select('count')
    .limit(1);

  if (error) {
    console.error('❌ Connection error:', error);
    return;
  }

  console.log('✅ Connection successful!');
  console.log('Data:', data);

  // Now get all tracks
  const { data: tracks, error: tracksError } = await supabase
    .from('audio_tracks')
    .select('*')
    .is('deleted_at', null)
    .limit(5);

  if (tracksError) {
    console.error('❌ Error fetching tracks:', tracksError);
    return;
  }

  console.log(`\n📦 Found ${tracks?.length} tracks (showing first 5)`);
  console.log(JSON.stringify(tracks, null, 2));
}

updateMetadata().catch(console.error);
