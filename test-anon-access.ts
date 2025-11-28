import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function testAnon() {
  console.log('Testing with anon key (no auth)...');
  
  const { data: channels, error } = await supabase
    .from('audio_channels')
    .select('id, name')
    .limit(3);

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✓ Success! Channels:', channels);
  }
}

testAnon();
