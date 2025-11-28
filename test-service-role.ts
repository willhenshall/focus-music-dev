import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testServiceRole() {
  console.log('Testing with SERVICE ROLE key...');
  
  const { data: channels, error } = await supabase
    .from('audio_channels')
    .select('id, name')
    .limit(3);

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✓ Success! Channels:', channels?.length, 'found');
    console.log('First channel:', channels?.[0]);
  }
}

testServiceRole();
