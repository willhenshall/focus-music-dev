import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_NAME = 'audio-files';
const PROGRESS_FILE = 'audio-metadata-upload-progress.json';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.opus'];

interface FileInfo {
  audioPath: string;
  jsonPath: string | null;
  size: number;
}

interface UploadProgress {
  uploadedFiles: string[];
  failedFiles: { file: string; error: string }[];
  totalFiles: number;
  completedCount: number;
  totalBytes: number;
  uploadedBytes: number;
}

function loadProgress(): UploadProgress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    uploadedFiles: [],
    failedFiles: [],
    totalFiles: 0,
    completedCount: 0,
    totalBytes: 0,
    uploadedBytes: 0
  };
}

function saveProgress(progress: UploadProgress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function findMatchingJsonFile(audioFilePath: string): string | null {
  const dir = path.dirname(audioFilePath);
  const baseName = path.basename(audioFilePath, path.extname(audioFilePath));
  const jsonPath = path.join(dir, `${baseName}.json`);

  if (fs.existsSync(jsonPath)) {
    return jsonPath;
  }
  return null;
}

function getAllAudioFilesWithJson(dir: string): FileInfo[] {
  const files: FileInfo[] = [];

  function traverse(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.includes(ext)) {
          const stats = fs.statSync(fullPath);
          const jsonPath = findMatchingJsonFile(fullPath);
          files.push({
            audioPath: fullPath,
            jsonPath,
            size: stats.size
          });
        }
      }
    }
  }

  traverse(dir);
  return files;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function uploadFile(
  localPath: string,
  storagePath: string,
  contentType: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fileContent = fs.readFileSync(localPath);

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileContent, {
        contentType,
        upsert: true
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function uploadAudioAndMetadata(
  fileInfo: FileInfo,
  baseDir: string
): Promise<{ success: boolean; error?: string; uploadedAudio: boolean; uploadedJson: boolean }> {
  const relativePath = path.relative(baseDir, fileInfo.audioPath);
  const storagePath = relativePath.replace(/\\/g, '/');

  const ext = path.extname(fileInfo.audioPath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus'
  };

  // Upload audio file
  const audioResult = await uploadFile(
    fileInfo.audioPath,
    storagePath,
    contentTypes[ext] || 'audio/mpeg'
  );

  if (!audioResult.success) {
    return {
      success: false,
      error: `Audio upload failed: ${audioResult.error}`,
      uploadedAudio: false,
      uploadedJson: false
    };
  }

  let uploadedJson = false;

  // Upload JSON sidecar if it exists
  if (fileInfo.jsonPath) {
    const baseName = path.basename(fileInfo.audioPath, path.extname(fileInfo.audioPath));
    const jsonStoragePath = `${baseName}.json`;

    const jsonResult = await uploadFile(
      fileInfo.jsonPath,
      jsonStoragePath,
      'application/json'
    );

    if (jsonResult.success) {
      uploadedJson = true;
    } else {
      // Don't fail the whole operation if JSON fails
      console.log(`   ⚠️  JSON upload warning: ${jsonResult.error}`);
    }
  }

  return {
    success: true,
    uploadedAudio: true,
    uploadedJson
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('\n❌ ERROR: Please provide the path to your audio files folder\n');
    console.log('Usage: npm run upload-with-metadata <path-to-folder>\n');
    console.log('Example: npm run upload-with-metadata EXTERNAL/audio-files\n');
    console.log('\nNote: This script will automatically upload both audio files and their matching JSON sidecars.\n');
    process.exit(1);
  }

  const sourceDir = args[0];

  if (!fs.existsSync(sourceDir)) {
    console.log(`\n❌ ERROR: Directory not found: ${sourceDir}\n`);
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 AUDIO FILES + METADATA UPLOAD TOOL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🔍 Scanning for audio files and JSON sidecars...\n');
  const allFiles = getAllAudioFilesWithJson(sourceDir);
  const filesWithJson = allFiles.filter(f => f.jsonPath !== null).length;
  const filesWithoutJson = allFiles.length - filesWithJson;

  console.log(`✅ Found ${allFiles.length} audio files`);
  console.log(`   📄 ${filesWithJson} with JSON sidecars`);
  console.log(`   ⚠️  ${filesWithoutJson} without JSON sidecars\n`);

  const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);
  console.log(`📦 Total size: ${formatBytes(totalSize)}\n`);

  let progress = loadProgress();

  if (progress.uploadedFiles.length > 0) {
    console.log(`📋 Resuming previous upload...`);
    console.log(`   Already uploaded: ${progress.uploadedFiles.length} files (${formatBytes(progress.uploadedBytes)})`);
    console.log(`   Failed: ${progress.failedFiles.length} files\n`);
  }

  progress.totalFiles = allFiles.length;
  progress.totalBytes = totalSize;

  const filesToUpload = allFiles.filter(f => !progress.uploadedFiles.includes(f.audioPath));

  if (filesToUpload.length === 0) {
    console.log('✅ All files already uploaded!\n');
    return;
  }

  console.log(`📤 Starting upload of ${filesToUpload.length} audio files...\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();
  let jsonCount = 0;

  for (let i = 0; i < filesToUpload.length; i++) {
    const fileInfo = filesToUpload[i];
    const fileName = path.basename(fileInfo.audioPath);

    const result = await uploadAudioAndMetadata(fileInfo, sourceDir);

    if (result.success) {
      progress.uploadedFiles.push(fileInfo.audioPath);
      progress.completedCount++;
      progress.uploadedBytes += fileInfo.size;

      if (result.uploadedJson) {
        jsonCount++;
      }

      const percentFiles = Math.round((progress.completedCount / progress.totalFiles) * 100);
      const percentBytes = Math.round((progress.uploadedBytes / progress.totalBytes) * 100);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = progress.completedCount / elapsed;
      const remaining = rate > 0 ? Math.round((filesToUpload.length - i - 1) / rate) : 0;

      const jsonIndicator = result.uploadedJson ? '📄' : '  ';
      console.log(`✅ ${jsonIndicator} [${percentFiles}%] ${fileName} (${formatBytes(fileInfo.size)})`);
      console.log(`   Files: ${progress.completedCount}/${progress.totalFiles} | Data: ${percentBytes}% | Time: ${elapsed}s | ETA: ${remaining}s\n`);
    } else {
      const relativePath = path.relative(sourceDir, fileInfo.audioPath);
      progress.failedFiles.push({ file: relativePath, error: result.error || 'Unknown error' });
      console.log(`❌ FAILED: ${fileName}`);
      console.log(`   Error: ${result.error}\n`);
    }

    if (i % 5 === 0 || result.success === false) {
      saveProgress(progress);
    }
  }

  saveProgress(progress);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 UPLOAD COMPLETE!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`✅ Successfully uploaded: ${progress.uploadedFiles.length} audio files (${formatBytes(progress.uploadedBytes)})`);
  console.log(`📄 JSON sidecars uploaded: ${jsonCount}`);
  console.log(`❌ Failed: ${progress.failedFiles.length} files`);
  console.log(`⏱️  Total time: ${Math.round((Date.now() - startTime) / 1000)}s\n`);

  if (progress.failedFiles.length > 0) {
    console.log('❌ FAILED FILES:');
    progress.failedFiles.forEach(f => {
      console.log(`   ${f.file}: ${f.error}`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ Done! Your audio files and metadata are uploaded.\n');
  console.log('Next steps:');
  console.log('1. Run: npm run call-update-metadata (to populate track metadata from JSON files)');
  console.log('2. Tracks will be ready to use!\n');
}

main().catch(console.error);
