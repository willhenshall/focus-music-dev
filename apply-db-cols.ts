import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data, error } = await supabase
    .from('audio_channels')
    .select('id, about_channel, about_image_url, about_external_link')
    .limit(1);

  if (error && error.message.includes('column')) {
    console.log('Columns do not exist. Creating via update...');
    
    const { data: channels } = await supabase
      .from('audio_channels')
      .select('id')
      .limit(1);
    
    if (channels && channels.length > 0) {
      const result = await supabase
        .from('audio_channels')
        .update({ 
          about_channel: null,
          about_image_url: null,
          about_external_link: null
        })
        .eq('id', channels[0].id);
      
      console.log('Update result:', result);
    }
  } else if (error) {
    console.error('Error:', error);
  } else {
    console.log('✓ Columns already exist!');
  }
}

run();
