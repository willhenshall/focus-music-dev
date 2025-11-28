import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Google Drive folder URL provided by user
const GOOGLE_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1BjBvXIWuxrLaYjEAMRgQDMqGOuGm8EHh?usp=sharing';

interface FileInfo {
  name: string;
  downloadUrl: string;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        if (response.headers.location) {
          downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function getGoogleDriveFiles(folderUrl: string): Promise<FileInfo[]> {
  // Extract folder ID from URL
  const folderIdMatch = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (!folderIdMatch) {
    throw new Error('Invalid Google Drive folder URL');
  }

  const folderId = folderIdMatch[1];

  console.log('\n⚠️  MANUAL STEP REQUIRED:');
  console.log('---------------------------------------------------');
  console.log('Google Drive requires authentication to list files.');
  console.log('Please manually download your files and place them in:');
  console.log('  ./temp-mp3-files/');
  console.log('\nAlternatively, you can:');
  console.log('1. Open your Google Drive folder');
  console.log('2. Select all files');
  console.log('3. Right-click → Download');
  console.log('4. Extract the zip to ./temp-mp3-files/');
  console.log('5. Run this script again');
  console.log('---------------------------------------------------\n');

  // Check if temp directory exists with files
  const tempDir = './temp-mp3-files';
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('Created ./temp-mp3-files/ directory');
    process.exit(0);
  }

  const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.mp3'));

  if (files.length === 0) {
    console.log('No MP3 files found in ./temp-mp3-files/');
    console.log('Please add your MP3 files to that directory and run again.');
    process.exit(0);
  }

  return files.map(f => ({
    name: f,
    downloadUrl: path.join(tempDir, f)
  }));
}

async function uploadToSupabase(localPath: string, fileName: string): Promise<void> {
  console.log(`Uploading ${fileName}...`);

  const fileBuffer = fs.readFileSync(localPath);
  const storagePath = `audio-tracks/${fileName}`;

  const { data, error } = await supabase.storage
    .from('audio-files')
    .upload(storagePath, fileBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });

  if (error) {
    throw new Error(`Upload failed for ${fileName}: ${error.message}`);
  }

  console.log(`✓ Uploaded: ${fileName}`);
}

async function getAudioDuration(filePath: string): Promise<number> {
  // Placeholder - returns 180 seconds (3 minutes) as default
  // In production, you'd use a library like 'music-metadata' to read actual duration
  return 180;
}

async function insertTrackRecord(fileName: string, channelId: string): Promise<void> {
  const storagePath = `audio-tracks/${fileName}`;
  const duration = await getAudioDuration(fileName);

  const { error } = await supabase
    .from('audio_tracks')
    .insert({
      channel_id: channelId,
      energy_level: 'medium', // Default, can be customized
      file_path: storagePath,
      duration_seconds: duration,
      metadata: {}
    });

  if (error) {
    console.error(`Failed to insert track record for ${fileName}:`, error.message);
  } else {
    console.log(`✓ Database record created for ${fileName}`);
  }
}

async function main() {
  console.log('Starting upload process...\n');

  // Get list of files
  const files = await getGoogleDriveFiles(GOOGLE_DRIVE_FOLDER_URL);
  console.log(`Found ${files.length} MP3 files\n`);

  // Get first channel from database to assign tracks to
  const { data: channels } = await supabase
    .from('audio_channels')
    .select('id')
    .limit(1);

  if (!channels || channels.length === 0) {
    console.error('No audio channels found in database. Please create channels first.');
    process.exit(1);
  }

  const defaultChannelId = channels[0].id;

  // Process each file
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      // File is already local in temp-mp3-files directory
      await uploadToSupabase(file.downloadUrl, file.name);
      await insertTrackRecord(file.name, defaultChannelId);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to process ${file.name}:`, error);
      failCount++;
    }
  }

  console.log('\n---------------------------------------------------');
  console.log(`Upload complete!`);
  console.log(`Success: ${successCount} files`);
  console.log(`Failed: ${failCount} files`);
  console.log('---------------------------------------------------\n');
}

main().catch(console.error);
