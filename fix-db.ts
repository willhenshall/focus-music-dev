import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xewajlyswijmjxuajhif.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZnl5dGx0dXd1eHV1b2V2YXZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDU0NDgwMywiZXhwIjoyMDc2MTIwODAzfQ.tIu_7VgOJvRb1QU-YHKvT1TbNaxOGZgOt_hdbkUQQ64'
);

async function run() {
  const { data, error } = await supabase
    .from('audio_channels')
    .select('id, about_channel')
    .limit(1);

  if (error) {
    console.log('Column check error:', error.message);
  } else {
    console.log('✓ Columns exist:', data);
  }
}

run();
