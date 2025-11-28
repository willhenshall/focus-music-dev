import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const GOOGLE_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1vmeH7Lm4JQc0Wbrw2cMY709sDN6BuwdJ?usp=sharing';

async function extractFolderId(url: string): Promise<string> {
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throw new Error('Invalid Google Drive folder URL');
  }
  return match[1];
}

async function getFileListFromGoogleDrive(folderId: string): Promise<any[]> {
  const apiKey = 'AIzaSyDummy'; // Google Drive API would need a key
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('Failed to fetch from Google Drive API:', error);
    return [];
  }
}

async function downloadFileFromGoogleDrive(fileId: string): Promise<ArrayBuffer> {
  const url = `https://drive.google.com/uc?export=download&id=${fileId}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  return response.arrayBuffer();
}

async function uploadToSupabase(fileBuffer: ArrayBuffer, fileName: string, channelId: string): Promise<void> {
  console.log(`Uploading ${fileName}...`);

  const storagePath = `audio-tracks/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('audio-files')
    .upload(storagePath, fileBuffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Upload failed for ${fileName}: ${uploadError.message}`);
  }

  const { error: dbError } = await supabase
    .from('audio_tracks')
    .insert({
      channel_id: channelId,
      energy_level: 'medium',
      file_path: storagePath,
      duration_seconds: 180,
      metadata: {}
    });

  if (dbError) {
    console.error(`Failed to create database record for ${fileName}:`, dbError.message);
  }

  console.log(`✓ Successfully imported: ${fileName}`);
}

async function main() {
  console.log('Google Drive Direct Import\n');
  console.log('Folder URL:', GOOGLE_DRIVE_FOLDER_URL);
  console.log('\n⚠️  IMPORTANT: Google Drive requires authentication\n');
  console.log('Google Drive files cannot be directly accessed via API without authentication.');
  console.log('However, I can provide you with two working solutions:\n');

  console.log('SOLUTION 1 - Using wget/curl (Recommended):');
  console.log('---------------------------------------------------');
  console.log('1. Make each file in your Google Drive folder publicly accessible');
  console.log('2. Get the direct download link for each file');
  console.log('3. I can then download them directly\n');

  console.log('SOLUTION 2 - Manual download and upload:');
  console.log('---------------------------------------------------');
  console.log('1. Download the folder as a zip from Google Drive');
  console.log('2. Extract to ./temp-mp3-files/');
  console.log('3. Run: npm run upload-from-drive\n');

  console.log('Which solution would you prefer?');
  console.log('Or provide individual file share links and I can download them directly.');
}

main().catch(console.error);
