import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
  console.log('=== CURRENT DATABASE STATE ===\n');
  
  // Get total count
  const { count } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Total tracks: ${count}\n`);
  
  // Get sample records
  const { data: samples } = await supabase
    .from('audio_tracks')
    .select('*')
    .limit(3);
  
  console.log('Sample records:');
  console.log(JSON.stringify(samples, null, 2));
  
  // Check NULL counts for key fields
  console.log('\n=== NULL FIELD COUNTS ===\n');
  
  const fields = ['tempo', 'track_id', 'speed', 'intensity', 'arousal', 'valence', 
                  'brightness', 'complexity', 'energy_set', 'duration_seconds'];
  
  for (const field of fields) {
    const { count } = await supabase
      .from('audio_tracks')
      .select('*', { count: 'exact', head: true })
      .is(field, null);
    console.log(`${field}: ${count} NULL records`);
  }
  
  // Check old URL format count
  const { count: oldUrlCount } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true })
    .like('file_path', '%eafyytltuwuxuuoevavo%');
  
  console.log(`\nOld URL format records: ${oldUrlCount}`);
}

checkSchema().catch(console.error);
