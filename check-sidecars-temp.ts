import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('Checking audio-sidecars bucket...\n');
  
  const { data, error } = await supabase.storage
    .from('audio-sidecars')
    .list('', { limit: 10 });
  
  if (error) {
    console.error('Error:', error);
  } else {
    const count = data ? data.length : 0;
    console.log('Found items:', count);
    if (data && data.length > 0) {
      console.log('First 10:', data.map(f => f.name));
      
      const firstJson = data.find(f => f.name.endsWith('.json'));
      if (firstJson) {
        console.log('\nDownloading:', firstJson.name);
        const { data: fileData, error: dlError } = await supabase.storage
          .from('audio-sidecars')
          .download(firstJson.name);
        
        if (dlError) {
          console.error('Download error:', dlError);
        } else {
          const text = await fileData.text();
          const json = JSON.parse(text);
          console.log('Sample metadata:', JSON.stringify(json, null, 2));
        }
      }
    }
  }
}

main();
