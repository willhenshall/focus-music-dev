import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function verify() {
  console.log('AUDIO TRACKS STATUS REPORT\n');
  
  const { count } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });
  
  console.log('Total records:', count, '\n');
  
  const fields = ['track_id', 'tempo', 'speed', 'intensity'];
  
  for (const field of fields) {
    const { count: nullCount } = await supabase
      .from('audio_tracks')
      .select('*', { count: 'exact', head: true })
      .is(field, null);
    console.log(field + ':', nullCount, 'NULL');
  }
  
  const { count: oldUrls } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true })
    .like('file_path', '%eafyytltuwuxuuoevavo%');
  
  console.log('\nOld URLs:', oldUrls);
}

verify();
