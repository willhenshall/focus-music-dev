import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function testAccess() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'user@test.com',
    password: 'testpass123'
  });

  if (authError) {
    console.error('Login failed:', authError);
    return;
  }

  console.log('✓ Login successful, user ID:', authData.user.id);

  const { data: channels, error: channelError } = await supabase
    .from('audio_channels')
    .select('id, name, slug')
    .limit(5);

  if (channelError) {
    console.error('❌ Channel fetch failed:', channelError);
  } else {
    console.log('✓ Channels fetched:', channels?.length);
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError) {
    console.error('❌ Profile fetch failed:', profileError);
  } else {
    console.log('✓ Profile:', {
      onboarding_completed: profile.onboarding_completed,
      is_admin: profile.is_admin
    });
  }
}

testAccess();
