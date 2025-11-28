import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPolicies() {
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE tablename IN ('audio_channels', 'user_profiles', 'audio_tracks')
      ORDER BY tablename, policyname;
    `
  });
  
  console.log('Policies:', JSON.stringify(data, null, 2));
}

checkPolicies();
