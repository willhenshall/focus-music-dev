import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET_NAME = 'audio-sidecars';
const PROGRESS_FILE = 'json-upload-progress.json';

interface UploadProgress {
  uploadedFiles: string[];
  failedFiles: { file: string; error: string }[];
  totalFiles: number;
  completedCount: number;
}

function loadProgress(): UploadProgress {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    uploadedFiles: [],
    failedFiles: [],
    totalFiles: 0,
    completedCount: 0
  };
}

function saveProgress(progress: UploadProgress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function getAllJsonFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files;
}

async function uploadFile(localPath: string, relativePath: string): Promise<{ success: boolean; error?: string }> {
  try {
    const fileContent = fs.readFileSync(localPath);
    const storagePath = relativePath.replace(/\\/g, '/');

    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileContent, {
        contentType: 'application/json',
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
    console.log('\n❌ ERROR: Please provide the path to your JSON sidecars folder\n');
    console.log('Usage: npm run upload-json <path-to-folder>\n');
    console.log('Example: npm run upload-json EXTERNAL/audio-files-sidecar-json\n');
    process.exit(1);
  }

  const sourceDir = args[0];

  if (!fs.existsSync(sourceDir)) {
    console.log(`\n❌ ERROR: Directory not found: ${sourceDir}\n`);
    process.exit(1);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 JSON SIDECAR UPLOAD TOOL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🔍 Scanning for JSON files...\n');
  const allFiles = getAllJsonFiles(sourceDir);
  console.log(`✅ Found ${allFiles.length} JSON files\n`);

  let progress = loadProgress();

  if (progress.uploadedFiles.length > 0) {
    console.log(`📋 Resuming previous upload...`);
    console.log(`   Already uploaded: ${progress.uploadedFiles.length} files`);
    console.log(`   Failed: ${progress.failedFiles.length} files\n`);
  }

  progress.totalFiles = allFiles.length;

  const filesToUpload = allFiles.filter(f => !progress.uploadedFiles.includes(f));

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
    const relativePath = path.relative(sourceDir, file);
    const fileName = path.basename(file);

    const result = await uploadFile(file, relativePath);

    if (result.success) {
      progress.uploadedFiles.push(file);
      progress.completedCount++;

      const percent = Math.round((progress.completedCount / progress.totalFiles) * 100);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = progress.completedCount / elapsed;
      const remaining = Math.round((filesToUpload.length - i - 1) / rate);

      console.log(`✅ [${percent}%] ${fileName}`);
      console.log(`   Progress: ${progress.completedCount}/${progress.totalFiles} | Time: ${elapsed}s | ETA: ${remaining}s\n`);
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
  console.log(`✅ Successfully uploaded: ${progress.uploadedFiles.length} files`);
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
  console.log('✅ Done! Your JSON sidecars are uploaded.\n');
  console.log('Next step: Run the audio file upload script\n');
}

main().catch(console.error);
