import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

async function uploadFile(filePath: string) {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = (fileBuffer.length / (1024 * 1024)).toFixed(2);

  console.log(`Uploading ${fileName} (${fileSize} MB)...`);

  const { data, error } = await supabase.storage
    .from('audio-files')
    .upload(fileName, fileBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });

  if (error) {
    console.error(`❌ Failed to upload ${fileName}:`, error.message);
    return false;
  }

  console.log(`✅ Successfully uploaded ${fileName}`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run direct-upload /path/to/file.mp3');
    console.log('   or: npm run direct-upload /path/to/folder');
    process.exit(1);
  }

  const targetPath = args[0];
  const stat = fs.statSync(targetPath);

  let files: string[] = [];

  if (stat.isDirectory()) {
    files = fs.readdirSync(targetPath)
      .filter(f => f.endsWith('.mp3'))
      .map(f => path.join(targetPath, f));
    console.log(`Found ${files.length} MP3 files in directory`);
  } else {
    files = [targetPath];
  }

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const success = await uploadFile(file);
    if (success) successCount++;
    else failCount++;
  }

  console.log(`\n📊 Upload complete: ${successCount} succeeded, ${failCount} failed`);
}

main().catch(console.error);
