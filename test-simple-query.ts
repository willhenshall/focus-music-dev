import { createClient } from '@supabase/supabase-js';

// Directly use the values from .env.test
const supabaseUrl = 'https://xewajlyswijmjxuajhif.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZnl5dGx0dXd1eHV1b2V2YXZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDU0NDgwMywiZXhwIjoyMDc2MTIwODAzfQ.tIu_7VgOJvRb1QU-YHKvT1TbNaxOGZgOt_hdbkUQQ64';

async function test() {
  console.log('Testing direct connection...');
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await supabase
    .from('audio_channels')
    .select('channel_name')
    .limit(3);

  console.log('Result:', error ? `ERROR: ${error.message}` : `SUCCESS: ${data?.length} channels`);
}

test();
