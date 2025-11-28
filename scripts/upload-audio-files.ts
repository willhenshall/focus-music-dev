import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_NAME = 'audio-files';
const PROGRESS_FILE = 'audio-upload-progress.json';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg', '.opus'];

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

function getAllAudioFiles(dir: string): Array<{ path: string; size: number }> {
  const files: Array<{ path: string; size: number }> = [];

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
          files.push({ path: fullPath, size: stats.size });
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

async function uploadFile(localPath: string, relativePath: string, fileSize: number): Promise<{ success: boolean; error?: string }> {
  try {
    const fileContent = fs.readFileSync(localPath);
    const storagePath = relativePath.replace(/\\/g, '/');

    const ext = path.extname(localPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus'
    };

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileContent, {
        contentType: contentTypes[ext] || 'audio/mpeg',
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

async function verifyFile(storagePath: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(path.dirname(storagePath), {
        search: path.basename(storagePath)
      });

    return !error && data && data.length > 0;
  } catch {
    return false;
  }
}

async function verifyAllUploads(progress: UploadProgress, baseDir: string): Promise<void> {
  console.log('\n🔍 VERIFYING ALL UPLOADS...\n');

  const toVerify = progress.uploadedFiles.length;
  let verified = 0;
  let missing = 0;

  for (let i = 0; i < progress.uploadedFiles.length; i++) {
    const file = progress.uploadedFiles[i];
    const relativePath = path.relative(baseDir, file);
    const storagePath = relativePath.replace(/\\/g, '/');

    const exists = await verifyFile(storagePath);

    if (exists) {
      verified++;
    } else {
      missing++;
      console.log(`❌ Missing: ${storagePath}`);
    }

    if ((i + 1) % 10 === 0 || i === progress.uploadedFiles.length - 1) {
      const percent = Math.round(((i + 1) / toVerify) * 100);
      process.stdout.write(`\r✅ Verified: ${verified} | ❌ Missing: ${missing} | Progress: ${percent}%`);
    }
  }

  console.log('\n\n✅ VERIFICATION COMPLETE!\n');
  console.log(`Total verified: ${verified}/${toVerify}`);
  if (missing > 0) {
    console.log(`⚠️  ${missing} files may need re-uploading`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('\n❌ ERROR: Please provide the path to your audio files folder\n');
    console.log('Usage: npm run upload-audio <path-to-folder>\n');
    console.log('Example: npm run upload-audio EXTERNAL/audio-files\n');
    process.exit(1);
  }

  const sourceDir = args[0];

  if (!fs.existsSync(sourceDir)) {
    console.log(`\n❌ ERROR: Directory not found: ${sourceDir}\n`);
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 AUDIO FILE UPLOAD TOOL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🔍 Scanning for audio files...\n');
  const allFiles = getAllAudioFiles(sourceDir);
  console.log(`✅ Found ${allFiles.length} audio files\n`);

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

  const filesToUpload = allFiles.filter(f => !progress.uploadedFiles.includes(f.path));

  if (filesToUpload.length === 0) {
    console.log('✅ All files already uploaded!\n');
    await verifyAllUploads(progress, sourceDir);
    return;
  }

  console.log(`📤 Starting upload of ${filesToUpload.length} files...\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const startTime = Date.now();

  for (let i = 0; i < filesToUpload.length; i++) {
    const file = filesToUpload[i];
    const relativePath = path.relative(sourceDir, file.path);
    const fileName = path.basename(file.path);

    const result = await uploadFile(file.path, relativePath, file.size);

    if (result.success) {
      progress.uploadedFiles.push(file.path);
      progress.completedCount++;
      progress.uploadedBytes += file.size;

      const percentFiles = Math.round((progress.completedCount / progress.totalFiles) * 100);
      const percentBytes = Math.round((progress.uploadedBytes / progress.totalBytes) * 100);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = progress.completedCount / elapsed;
      const remaining = rate > 0 ? Math.round((filesToUpload.length - i - 1) / rate) : 0;

      console.log(`✅ [${percentFiles}%] ${fileName} (${formatBytes(file.size)})`);
      console.log(`   Files: ${progress.completedCount}/${progress.totalFiles} | Data: ${percentBytes}% | Time: ${elapsed}s | ETA: ${remaining}s\n`);
    } else {
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
  console.log(`✅ Successfully uploaded: ${progress.uploadedFiles.length} files (${formatBytes(progress.uploadedBytes)})`);
  console.log(`❌ Failed: ${progress.failedFiles.length} files`);
  console.log(`⏱️  Total time: ${Math.round((Date.now() - startTime) / 1000)}s\n`);

  if (progress.failedFiles.length > 0) {
    console.log('❌ FAILED FILES:');
    progress.failedFiles.forEach(f => {
      console.log(`   ${f.file}: ${f.error}`);
    });
    console.log('');
  }

  await verifyAllUploads(progress, sourceDir);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ Done! Your audio files are uploaded.\n');
  console.log('Next step: Run the ingestion script to populate the database\n');
}

main().catch(console.error);
