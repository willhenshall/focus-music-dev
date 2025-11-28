import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function uploadFile(filePath: string) {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  console.log(`Uploading ${fileName}...`);

  const { data, error } = await supabase.storage
    .from('audio-files')
    .upload(fileName, fileBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });

  if (error) {
    console.error(`Error uploading ${fileName}:`, error);
  } else {
    console.log(`✓ Successfully uploaded ${fileName}`);
  }
}

async function main() {
  const uploadDir = process.argv[2];

  if (!uploadDir) {
    console.log('Usage: npm run upload-files <directory-with-mp3-files>');
    process.exit(1);
  }

  const files = fs.readdirSync(uploadDir)
    .filter(f => f.endsWith('.mp3'))
    .map(f => path.join(uploadDir, f));

  console.log(`Found ${files.length} MP3 files to upload\n`);

  for (const file of files) {
    await uploadFile(file);
  }

  console.log('\nUpload complete!');
}

main();
