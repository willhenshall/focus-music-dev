import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function uploadExportsToStorage() {
  console.log('Uploading playlist-exports.tar.gz to Supabase Storage...\n');

  const filePath = 'playlist-exports.tar.gz';
  const fileBuffer = fs.readFileSync(filePath);

  const { data, error } = await supabase.storage
    .from('audio-files')
    .upload('exports/playlist-exports.tar.gz', fileBuffer, {
      contentType: 'application/gzip',
      upsert: true
    });

  if (error) {
    console.error('Error uploading file:', error);
    return;
  }

  console.log('✓ File uploaded successfully!');

  const { data: publicUrlData } = supabase.storage
    .from('audio-files')
    .getPublicUrl('exports/playlist-exports.tar.gz');

  console.log('\n' + '='.repeat(70));
  console.log('DOWNLOAD URL:');
  console.log('='.repeat(70));
  console.log(publicUrlData.publicUrl);
  console.log('='.repeat(70));
}

uploadExportsToStorage().catch(console.error);
