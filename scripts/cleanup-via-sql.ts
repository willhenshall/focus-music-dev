import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

async function cleanup() {
  console.log('🧹 Cleaning up audio_tracks table...\n');
  
  // Try to get valid credentials
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials');
    console.log('\nPlease use the MCP tools instead:');
    console.log('  mcp__supabase__execute_sql with query: DELETE FROM audio_tracks;');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  
  // Get count before
  const { count: before } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Current records: ${before}`);
  
  // Delete all
  const { error } = await supabase
    .from('audio_tracks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (error) {
    console.error('❌ Error:', error);
    console.log('\nTrying alternative method via RPC...');
    process.exit(1);
  }
  
  console.log('✅ All records deleted');
}

cleanup().catch(console.error);
