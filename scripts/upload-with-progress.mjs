import { createReadStream, statSync } from 'fs';
import { readdir } from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CHANNEL_ID = 'f76d55c8-3ac0-4d0b-8331-6968ada11896';
const FILES_DIR = 'temp-mp3-files';

async function uploadFile(filePath, fileName) {
  const stats = statSync(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(1);

  console.log(`  File size: ${fileSizeMB} MB`);
  console.log(`  Uploading to storage...`);

  const storagePath = `audio-tracks/${fileName}`;

  const fileBuffer = await import('fs').then(fs =>
    fs.promises.readFile(filePath)
  );

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('audio-files')
    .upload(storagePath, fileBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });

  if (uploadError) {
    console.log(`  ✗ Upload failed: ${uploadError.message}`);
    return false;
  }

  console.log(`  ✓ Uploaded to storage`);

  const { error: dbError } = await supabase
    .from('audio_tracks')
    .insert({
      channel_id: CHANNEL_ID,
      energy_level: 'medium',
      file_path: storagePath,
      duration_seconds: 180,
      metadata: { source: 'google_drive_import' }
    });

  if (dbError && !dbError.message.includes('duplicate')) {
    console.log(`  ⚠ Database warning: ${dbError.message}`);
  } else {
    console.log(`  ✓ Database record created`);
  }

  return true;
}

async function main() {
  const files = await readdir(FILES_DIR);
  const mp3Files = files.filter(f => f.endsWith('.mp3')).sort();

  const total = mp3Files.length;

  console.log('\n' + '='.repeat(60));
  console.log(`Uploading ${total} files to Supabase`);
  console.log('='.repeat(60) + '\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < mp3Files.length; i++) {
    const fileName = mp3Files[i];
    const filePath = resolve(FILES_DIR, fileName);

    console.log(`[${i + 1}/${total}] ${fileName}`);

    try {
      const success = await uploadFile(filePath, fileName);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      failCount++;
    }

    console.log();
  }

  console.log('='.repeat(60));
  console.log('Upload Complete!');
  console.log(`Success: ${successCount} files`);
  console.log(`Failed: ${failCount} files`);
  console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
