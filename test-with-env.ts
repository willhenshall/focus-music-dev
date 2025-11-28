import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

async function test() {
  console.log('\nTesting with .env file...');
  
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from('audio_channels')
    .select('channel_name')
    .limit(3);

  console.log('ANON KEY Result:', error ? `ERROR: ${error.message}` : `SUCCESS: ${data?.length} channels`);
}

test();
