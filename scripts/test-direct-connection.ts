import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

async function testConnection() {
  console.log('Testing direct Supabase connection...\n');

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('URL:', url);
  console.log('Service Key (first 20 chars):', serviceKey?.substring(0, 20) + '...');
  console.log('');

  if (!url || !serviceKey) {
    console.error('❌ Missing credentials');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('Test 1: Query table count...');
  const { data: tableData, error: tableError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE') as any;

  if (tableError) {
    console.log('❌ Table query failed:', tableError.message);
  } else {
    console.log('✅ Can query metadata');
  }

  console.log('\nTest 2: Query audio_channels...');
  const { data: channelData, error: channelError, count } = await supabase
    .from('audio_channels')
    .select('id, name', { count: 'exact' })
    .limit(3);

  if (channelError) {
    console.log('❌ Channel query failed:', channelError.message);
    console.log('Error details:', JSON.stringify(channelError, null, 2));
  } else {
    console.log('✅ Successfully queried audio_channels');
    console.log('Count:', count);
    console.log('Sample data:', channelData);
  }

  console.log('\nTest 3: Query user_profiles...');
  const { data: userData, error: userError } = await supabase
    .from('user_profiles')
    .select('id, email')
    .limit(1);

  if (userError) {
    console.log('❌ User query failed:', userError.message);
  } else {
    console.log('✅ Successfully queried user_profiles');
    console.log('Sample:', userData?.length || 0, 'rows');
  }

  console.log('\nTest 4: Direct REST API call...');
  try {
    const response = await fetch(`${url}/rest/v1/audio_channels?select=count`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);

    if (response.ok) {
      const data = await response.json();
      console.log('✅ REST API working');
      console.log('Response:', data);
    } else {
      const errorText = await response.text();
      console.log('❌ REST API failed');
      console.log('Error:', errorText);
    }
  } catch (err: any) {
    console.log('❌ REST API exception:', err.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('CONNECTION TEST COMPLETE');
  console.log('='.repeat(60));
}

testConnection().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
