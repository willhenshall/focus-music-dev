import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function test() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'user@test.com',
    password: 'testpass123'
  });

  if (authError) {
    console.error('Login failed:', authError);
    return;
  }

  console.log('✓ Login successful');

  const { data: channels, error } = await supabase
    .from('audio_channels')
    .select('*')
    .limit(3);

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✓ Channels fetched:', channels?.length);
    console.log('First channel:', channels?.[0]?.name || channels?.[0]?.channel_name);
  }
}

test();
