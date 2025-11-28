import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// EMBEDDED CREDENTIALS - NO .env FILE NEEDED
const supabaseUrl = 'https://xewajlyswijmjxuajhif.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZnl5dGx0dXd1eHV1b2V2YXZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDU0NDgwMywiZXhwIjoyMDc2MTIwODAzfQ.tIu_7VgOJvRb1QU-YHKvT1TbNaxOGZgOt_hdbkUQQ64';

console.log('✓ Using embedded credentials');
console.log(`  URL: ${supabaseUrl}`);
console.log(`  Service Role Key: ${serviceRoleKey.substring(0, 20)}...`);

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    }
  }
);

interface UploadProgress {
  total: number;
  completed: number;
  failed: number;
  startTime: number;
}

async function uploadAudioFile(filePath: string, fileName: string): Promise<boolean> {
  try {
    const fileBuffer = fs.readFileSync(filePath);

    const { data, error } = await supabase.storage
      .from('audio-files')
      .upload(fileName, fileBuffer, {
        contentType: 'audio/mpeg',
        upsert: false
      });

    if (error) {
      console.error(`\n   ❌ Failed to upload ${fileName}:`);
      console.error(`      Error message: ${error.message}`);
      console.error(`      Full error:`, JSON.stringify(error, null, 2));
      return false;
    }

    return true;
  } catch (error) {
    console.error(`\n   ❌ Exception uploading ${fileName}:`, error);
    return false;
  }
}

async function createDatabaseRecord(fileName: string, fileSize: number): Promise<boolean> {
  const trackId = fileName.replace('.mp3', '');
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/audio-files/${fileName}`;

  const { error } = await supabase
    .from('audio_tracks')
    .insert({
      file_path: publicUrl,
      energy_level: 'medium',
      duration_seconds: 0,
      metadata: {
        track_id: trackId,
        track_name: trackId,
        artist_name: 'Focus.Music',
        file_size: fileSize,
        mimetype: 'audio/mpeg'
      }
    });

  if (error) {
    console.error(`   ❌ Failed to create DB record for ${trackId}:`, error.message);
    return false;
  }

  return true;
}

function printProgress(progress: UploadProgress) {
  const elapsed = (Date.now() - progress.startTime) / 1000;
  const rate = progress.completed / elapsed;
  const remaining = progress.total - progress.completed;
  const eta = remaining / rate;

  const percent = ((progress.completed / progress.total) * 100).toFixed(1);

  process.stdout.write(`\r   Progress: ${progress.completed}/${progress.total} (${percent}%) | Failed: ${progress.failed} | ETA: ${Math.round(eta)}s`);
}

async function bulkImportAudio(audioDirectory: string) {
  console.log('📦 BULK AUDIO IMPORT (STANDALONE VERSION)');
  console.log('==========================================\n');

  if (!fs.existsSync(audioDirectory)) {
    console.error(`❌ Directory not found: ${audioDirectory}`);
    console.log('\n💡 Usage:');
    console.log('   Place all 11,295 MP3 files in a directory, then run:');
    console.log('   npx tsx scripts/bulk-import-standalone.ts /path/to/audio/files');
    return;
  }

  console.log(`📂 Source directory: ${audioDirectory}\n`);

  const files = fs.readdirSync(audioDirectory).filter(f => f.endsWith('.mp3'));

  if (files.length === 0) {
    console.error('❌ No MP3 files found in directory');
    return;
  }

  console.log(`📊 Found ${files.length} MP3 files\n`);
  console.log('⚠️  This will upload all files to Supabase storage and create database records');
  console.log('⏳ Starting in 5 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  const progress: UploadProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
    startTime: Date.now()
  };

  const failedFiles: string[] = [];

  console.log('🚀 Starting upload...\n');

  // Test with first file to verify credentials
  console.log('Testing upload with first file...\n');
  const testFile = files[0];
  const testFilePath = path.join(audioDirectory, testFile);
  const testStats = fs.statSync(testFilePath);

  console.log(`Attempting to upload: ${testFile}`);
  console.log(`File size: ${testStats.size} bytes\n`);

  const testSuccess = await uploadAudioFile(testFilePath, testFile);

  if (!testSuccess) {
    console.log('\n❌ Upload test failed. Please check the error above.');
    console.log('\nDebugging info:');
    console.log(`  Supabase URL: ${supabaseUrl}`);
    console.log(`  Service Role Key (first 20 chars): ${serviceRoleKey.substring(0, 20)}...`);
    console.log(`  Bucket: audio-files`);
    process.exit(1);
  }

  console.log('✅ Test upload successful! Continuing with full import...\n');

  for (const file of files) {
    const filePath = path.join(audioDirectory, file);
    const stats = fs.statSync(filePath);

    const uploadSuccess = await uploadAudioFile(filePath, file);

    if (uploadSuccess) {
      const dbSuccess = await createDatabaseRecord(file, stats.size);
      if (!dbSuccess) {
        progress.failed++;
        failedFiles.push(file);
      }
    } else {
      progress.failed++;
      failedFiles.push(file);
    }

    progress.completed++;
    printProgress(progress);

    if (progress.completed % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('IMPORT COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`📊 Summary:`);
  console.log(`   - Total files: ${progress.total}`);
  console.log(`   - Successfully imported: ${progress.completed - progress.failed}`);
  console.log(`   - Failed: ${progress.failed}`);

  const duration = (Date.now() - progress.startTime) / 1000;
  console.log(`   - Duration: ${Math.round(duration)}s`);
  console.log(`   - Average rate: ${(progress.completed / duration).toFixed(1)} files/sec\n`);

  if (failedFiles.length > 0) {
    console.log('❌ Failed files:');
    failedFiles.slice(0, 20).forEach(f => console.log(`   - ${f}`));
    if (failedFiles.length > 20) {
      console.log(`   ... and ${failedFiles.length - 20} more`);
    }

    const failedPath = path.join(process.cwd(), 'failed-uploads.txt');
    fs.writeFileSync(failedPath, failedFiles.join('\n'));
    console.log(`\n📝 Full list saved to: ${failedPath}`);
  }

  console.log('\n✅ Ready to import corrected channel JSON files');
}

const audioDir = process.argv[2] || './audio-files-complete';
bulkImportAudio(audioDir).catch(console.error);
