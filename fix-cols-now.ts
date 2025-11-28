import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xewajlyswijmjxuajhif.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZnl5dGx0dXd1eHV1b2V2YXZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDU0NDgwMywiZXhwIjoyMDc2MTIwODAzfQ.tIu_7VgOJvRb1QU-YHKvT1TbNaxOGZgOt_hdbkUQQ64',
  {
    db: { schema: 'public' },
    auth: { persistSession: false, autoRefreshToken: false }
  }
);

async function run() {
  console.log('Testing column access...');
  
  const { data, error } = await supabase
    .from('audio_channels')
    .select('id, channel_name, about_channel, about_image_url, about_external_link')
    .limit(1);

  if (error) {
    console.log('❌ Error:', error.message);
    console.log('\nAttempting to add columns via SQL...');
    
    // Try via SQL
    const { error: sqlError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE audio_channels 
        ADD COLUMN IF NOT EXISTS about_channel TEXT,
        ADD COLUMN IF NOT EXISTS about_image_url TEXT,
        ADD COLUMN IF NOT EXISTS about_external_link TEXT;
      `
    });
    
    if (sqlError) {
      console.log('SQL Error:', sqlError);
    } else {
      console.log('✓ Columns added via SQL');
    }
  } else {
    console.log('✓ Columns already exist!');
    console.log('Sample:', data);
  }
}

run();
