/**
 * Multi-Bitrate HLS Ladder Transcoder
 * 
 * Creates a 4-bitrate HLS ladder (32k/64k/96k/128k) for each audio track
 * and uploads directly to Cloudflare R2.
 * 
 * Bitrate Ladder:
 *   - LOW:     32 kbps (BANDWIDTH=48000)
 *   - MEDIUM:  64 kbps (BANDWIDTH=96000)
 *   - HIGH:    96 kbps (BANDWIDTH=144000)
 *   - PREMIUM: 128 kbps (BANDWIDTH=192000)
 * 
 * Usage:
 *   npx tsx scripts/hls-ladder/transcode-multibitrate-hls.ts --all
 *   npx tsx scripts/hls-ladder/transcode-multibitrate-hls.ts --track <track-id>
 *   npx tsx scripts/hls-ladder/transcode-multibitrate-hls.ts --all --concurrency 4
 *   npx tsx scripts/hls-ladder/transcode-multibitrate-hls.ts --all --dry-run
 * 
 * Requirements:
 *   - FFmpeg installed and in PATH
 *   - VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import 'dotenv/config';

// ============================================================================
// CONFIGURATION
// ============================================================================

// R2 Configuration (same as sync-hls-to-cdn.ts)
const R2_CONFIG = {
  accountId: "531f033f1f3eb591e89baff98f027cee",
  bucketName: "focus-music-audio",
  accessKeyId: "d6c3feb94bb923b619c9661f950019d2",
  secretAccessKey: "bc5d2ea0d38fecb4ef8442b78621a6b398415b3373cc1c174b12564a111678f3",
  publicUrl: "https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev",
  hlsPath: "hls",
  audioPath: "audio", // Where MP3s are stored in R2
};

// Bitrate ladder configuration
const BITRATE_LADDER = [
  { name: 'low', bitrate: 32, bandwidth: 48000 },
  { name: 'medium', bitrate: 64, bandwidth: 96000 },
  { name: 'high', bitrate: 96, bandwidth: 144000 },
  { name: 'premium', bitrate: 128, bandwidth: 192000 },
];

const HLS_CONFIG = {
  SEGMENT_DURATION: 6,
  AUDIO_CODEC: 'aac',
  AUDIO_CHANNELS: 2,
  SAMPLE_RATE: 44100,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
};

// ============================================================================
// TYPES
// ============================================================================

interface AudioTrack {
  id: string;
  track_id: string;
  file_path: string;
  duration_seconds?: number;
  metadata?: {
    track_name?: string;
    artist_name?: string;
  };
}

interface TranscodeResult {
  trackId: string;
  success: boolean;
  error?: string;
  cdnUrl?: string;
  processingTime?: number;
}

interface TranscodeOptions {
  all?: boolean;
  trackId?: string;
  dryRun?: boolean;
  limit?: number;
  concurrency?: number;
  force?: boolean;
}

interface ProgressStats {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  startTime: number;
  processingTimes: number[];
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

let isShuttingDown = false;

process.on('SIGINT', () => {
  console.log('\n\n⚠️  Received SIGINT - shutting down gracefully...');
  isShuttingDown = true;
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Received SIGTERM - shutting down gracefully...');
  isShuttingDown = true;
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function calculateETA(stats: ProgressStats): string {
  if (stats.processingTimes.length < 2) return 'calculating...';
  
  const recentTimes = stats.processingTimes.slice(-5);
  const avgTime = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
  const remaining = stats.total - stats.completed - stats.failed;
  const etaSeconds = (remaining * avgTime) / 1000;
  
  return formatDuration(etaSeconds);
}

function printProgress(stats: ProgressStats): void {
  const percent = ((stats.completed + stats.failed) / stats.total * 100).toFixed(1);
  const elapsed = formatDuration((Date.now() - stats.startTime) / 1000);
  const eta = calculateETA(stats);
  
  console.log(`\n📊 Progress: ${stats.completed + stats.failed}/${stats.total} (${percent}%)`);
  console.log(`   ✅ Success: ${stats.completed} | ❌ Failed: ${stats.failed} | 🔄 Active: ${stats.inProgress}`);
  console.log(`   ⏱️  Elapsed: ${elapsed} | ETA: ${eta}`);
}

// ============================================================================
// CLIENTS
// ============================================================================

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in .env');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

function getS3Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_CONFIG.accessKeyId,
      secretAccessKey: R2_CONFIG.secretAccessKey,
    },
  });
}

// ============================================================================
// FFMPEG
// ============================================================================

function checkFFmpegInstalled(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getFFmpegVersion(): string {
  try {
    const output = execSync('ffmpeg -version', { encoding: 'utf-8' });
    const match = output.match(/ffmpeg version (\S+)/);
    return match ? match[1] : 'unknown';
  } catch {
    return 'not installed';
  }
}

/**
 * Transcode MP3 to a single HLS variant
 */
async function transcodeVariant(
  inputPath: string,
  outputDir: string,
  bitrate: number
): Promise<{ success: boolean; segmentCount: number; error?: string }> {
  return new Promise((resolve) => {
    const indexFile = path.join(outputDir, 'index.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');
    
    const ffmpegArgs = [
      '-i', inputPath,
      '-c:a', HLS_CONFIG.AUDIO_CODEC,
      '-b:a', `${bitrate}k`,
      '-ac', HLS_CONFIG.AUDIO_CHANNELS.toString(),
      '-ar', HLS_CONFIG.SAMPLE_RATE.toString(),
      '-f', 'hls',
      '-hls_time', HLS_CONFIG.SEGMENT_DURATION.toString(),
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', segmentPattern,
      '-y',
      indexFile,
    ];
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: 'pipe' });
    
    let stderr = '';
    ffmpeg.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const files = fs.readdirSync(outputDir);
        const segmentCount = files.filter(f => f.endsWith('.ts')).length;
        resolve({ success: true, segmentCount });
      } else {
        resolve({ success: false, segmentCount: 0, error: stderr.slice(-500) });
      }
    });
    
    ffmpeg.on('error', (err) => {
      resolve({ success: false, segmentCount: 0, error: err.message });
    });
  });
}

/**
 * Generate the master playlist with all variants
 */
function generateMasterPlaylist(outputDir: string): void {
  const masterContent = `#EXTM3U
#EXT-X-VERSION:3

# 32 kbps LOW
#EXT-X-STREAM-INF:BANDWIDTH=48000,CODECS="mp4a.40.2"
low/index.m3u8

# 64 kbps MEDIUM
#EXT-X-STREAM-INF:BANDWIDTH=96000,CODECS="mp4a.40.2"
medium/index.m3u8

# 96 kbps HIGH
#EXT-X-STREAM-INF:BANDWIDTH=144000,CODECS="mp4a.40.2"
high/index.m3u8

# 128 kbps PREMIUM
#EXT-X-STREAM-INF:BANDWIDTH=192000,CODECS="mp4a.40.2"
premium/index.m3u8
`;
  
  fs.writeFileSync(path.join(outputDir, 'master.m3u8'), masterContent);
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

/**
 * Download MP3 from R2 (faster than Supabase Storage)
 */
async function downloadTrackFromR2(
  s3Client: S3Client,
  trackId: string,
  filePath: string,
  localPath: string
): Promise<boolean> {
  // Try multiple possible R2 paths for the MP3
  const possibleKeys = [
    `${R2_CONFIG.audioPath}/${trackId}.mp3`,
    `${R2_CONFIG.audioPath}/${trackId}`,
    // Extract filename from file_path if it's a URL or path
    filePath.includes('/') ? `${R2_CONFIG.audioPath}/${filePath.split('/').pop()}` : null,
    // Direct path if stored differently
    filePath.replace(/^.*\/audio-files\//, `${R2_CONFIG.audioPath}/`),
    filePath.replace(/^.*\/audio\//, `${R2_CONFIG.audioPath}/`),
  ].filter(Boolean) as string[];
  
  for (let attempt = 1; attempt <= HLS_CONFIG.MAX_RETRIES; attempt++) {
    for (const key of possibleKeys) {
      try {
        const command = new GetObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: key,
        });
        
        const response = await s3Client.send(command);
        
        if (response.Body) {
          const chunks: Uint8Array[] = [];
          // @ts-ignore - Body is a readable stream
          for await (const chunk of response.Body) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          fs.writeFileSync(localPath, buffer);
          return true;
        }
      } catch (err: any) {
        // NoSuchKey is expected when trying different paths
        if (err.name !== 'NoSuchKey') {
          console.log(`   ⚠️  R2 download error for ${key}: ${err.message}`);
        }
        continue;
      }
    }
    
    if (attempt < HLS_CONFIG.MAX_RETRIES) {
      console.log(`   ⚠️  Download attempt ${attempt} failed, retrying...`);
      await sleep(HLS_CONFIG.RETRY_DELAY_MS * attempt);
    }
  }
  
  console.error(`   ❌ Could not find MP3 in R2 for track ${trackId}`);
  console.error(`      Tried keys: ${possibleKeys.slice(0, 3).join(', ')}`);
  return false;
}

async function uploadToR2(
  s3Client: S3Client,
  localPath: string,
  r2Key: string
): Promise<boolean> {
  for (let attempt = 1; attempt <= HLS_CONFIG.MAX_RETRIES; attempt++) {
    try {
      const fileContent = fs.readFileSync(localPath);
      const contentType = localPath.endsWith('.m3u8') 
        ? 'application/vnd.apple.mpegurl' 
        : 'video/mp2t';
      
      const command = new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: r2Key,
        Body: fileContent,
        ContentType: contentType,
      });
      
      await s3Client.send(command);
      return true;
    } catch (err) {
      if (attempt < HLS_CONFIG.MAX_RETRIES) {
        await sleep(HLS_CONFIG.RETRY_DELAY_MS * attempt);
        continue;
      }
      console.error(`   Failed to upload ${r2Key}: ${err}`);
    }
  }
  return false;
}

async function uploadHLSDirectory(
  s3Client: S3Client,
  localDir: string,
  trackId: string
): Promise<{ success: boolean; filesUploaded: number }> {
  let uploadedCount = 0;
  let failedCount = 0;
  
  // Upload master.m3u8
  const masterPath = path.join(localDir, 'master.m3u8');
  if (fs.existsSync(masterPath)) {
    const success = await uploadToR2(s3Client, masterPath, `${R2_CONFIG.hlsPath}/${trackId}/master.m3u8`);
    if (success) uploadedCount++;
    else failedCount++;
  }
  
  // Upload each variant directory
  for (const variant of BITRATE_LADDER) {
    const variantDir = path.join(localDir, variant.name);
    if (!fs.existsSync(variantDir)) continue;
    
    const files = fs.readdirSync(variantDir);
    for (const file of files) {
      const localPath = path.join(variantDir, file);
      const r2Key = `${R2_CONFIG.hlsPath}/${trackId}/${variant.name}/${file}`;
      
      const success = await uploadToR2(s3Client, localPath, r2Key);
      if (success) uploadedCount++;
      else failedCount++;
    }
  }
  
  return { success: failedCount === 0, filesUploaded: uploadedCount };
}

async function checkTrackExistsInR2(
  s3Client: S3Client,
  trackId: string
): Promise<boolean> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      Prefix: `${R2_CONFIG.hlsPath}/${trackId}/`,
      MaxKeys: 1,
    });
    const response = await s3Client.send(command);
    return (response.Contents?.length || 0) > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function fetchTracksToTranscode(
  supabase: SupabaseClient,
  options: TranscodeOptions
): Promise<AudioTrack[]> {
  const PAGE_SIZE = 1000;
  let allTracks: AudioTrack[] = [];
  let offset = 0;
  let hasMore = true;
  
  console.log('   Fetching tracks from database...');
  
  while (hasMore) {
    let query = supabase
      .from('audio_tracks')
      .select('id, track_id, file_path, duration_seconds, metadata')
      .is('deleted_at', null)
      .not('file_path', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    
    if (options.trackId) {
      query = query.eq('track_id', options.trackId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch tracks: ${error.message}`);
    }
    
    if (data && data.length > 0) {
      allTracks = allTracks.concat(data);
      console.log(`   ... fetched ${allTracks.length} tracks`);
      offset += PAGE_SIZE;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }
  
  if (options.limit && allTracks.length > options.limit) {
    allTracks = allTracks.slice(0, options.limit);
  }
  
  return allTracks;
}

async function updateTrackHLSLadderUrl(
  supabase: SupabaseClient,
  trackId: string,
  cdnUrl: string
): Promise<boolean> {
  for (let attempt = 1; attempt <= HLS_CONFIG.MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('audio_tracks')
      .update({
        hls_ladder_url: cdnUrl,
        hls_ladder_transcoded_at: new Date().toISOString(),
      })
      .eq('track_id', trackId);
    
    if (!error) return true;
    
    if (attempt < HLS_CONFIG.MAX_RETRIES) {
      await sleep(HLS_CONFIG.RETRY_DELAY_MS);
      continue;
    }
    console.error(`   ⚠️  Database update failed: ${error.message}`);
  }
  return false;
}

// ============================================================================
// MAIN TRANSCODING PIPELINE
// ============================================================================

async function transcodeTrack(
  supabase: SupabaseClient,
  s3Client: S3Client,
  track: AudioTrack,
  tempDir: string,
  trackIndex: number,
  totalTracks: number,
  force: boolean
): Promise<TranscodeResult> {
  const startTime = Date.now();
  const trackId = track.track_id;
  const trackName = track.metadata?.track_name || 'Unknown';
  const duration = track.duration_seconds ? Math.round(track.duration_seconds / 60) : null;
  
  console.log(`\n📀 [${trackIndex}/${totalTracks}] Track: ${trackId}`);
  console.log(`   Name: ${trackName}`);
  if (duration) console.log(`   Duration: ${duration} min`);
  
  // Check if already exists in R2 (skip unless --force)
  if (!force) {
    const exists = await checkTrackExistsInR2(s3Client, trackId);
    if (exists) {
      console.log(`   ⏭️  Already exists in R2, skipping`);
      return { trackId, success: true, cdnUrl: `${R2_CONFIG.publicUrl}/${R2_CONFIG.hlsPath}/${trackId}/master.m3u8` };
    }
  }
  
  // Create temp directories
  const trackTempDir = path.join(tempDir, trackId);
  const hlsOutputDir = path.join(trackTempDir, 'hls');
  
  for (const variant of BITRATE_LADDER) {
    fs.mkdirSync(path.join(hlsOutputDir, variant.name), { recursive: true });
  }
  
  const localMp3Path = path.join(trackTempDir, 'source.mp3');
  
  try {
    // Step 1: Download MP3 from R2 (faster than Supabase)
    console.log('   ⬇️  Downloading from R2...');
    const downloaded = await downloadTrackFromR2(s3Client, trackId, track.file_path, localMp3Path);
    if (!downloaded) {
      return { trackId, success: false, error: 'Failed to download MP3 from R2' };
    }
    
    const fileSizeMB = (fs.statSync(localMp3Path).size / (1024 * 1024)).toFixed(1);
    console.log(`   ✓ Downloaded (${fileSizeMB} MB)`);
    
    // Step 2: Transcode each variant
    console.log('   🔄 Transcoding 4-bitrate ladder...');
    
    for (const variant of BITRATE_LADDER) {
      const variantDir = path.join(hlsOutputDir, variant.name);
      console.log(`      ${variant.name.toUpperCase()} (${variant.bitrate}k)...`);
      
      const result = await transcodeVariant(localMp3Path, variantDir, variant.bitrate);
      if (!result.success) {
        return { trackId, success: false, error: `Failed to encode ${variant.name}: ${result.error}` };
      }
      console.log(`      ✓ ${result.segmentCount} segments`);
    }
    
    // Step 3: Generate master playlist
    console.log('   📝 Creating master playlist...');
    generateMasterPlaylist(hlsOutputDir);
    
    // Step 4: Upload to R2
    console.log('   ⬆️  Uploading to R2...');
    const uploadResult = await uploadHLSDirectory(s3Client, hlsOutputDir, trackId);
    if (!uploadResult.success) {
      return { trackId, success: false, error: 'Failed to upload some files' };
    }
    console.log(`   ✓ Uploaded ${uploadResult.filesUploaded} files`);
    
    // Step 5: Update database
    const cdnUrl = `${R2_CONFIG.publicUrl}/${R2_CONFIG.hlsPath}/${trackId}/master.m3u8`;
    await updateTrackHLSLadderUrl(supabase, trackId, cdnUrl);
    
    const processingTime = Date.now() - startTime;
    console.log(`   ✅ Complete in ${(processingTime / 1000).toFixed(1)}s`);
    console.log(`   🔗 ${cdnUrl}`);
    
    return { trackId, success: true, cdnUrl, processingTime };
  } catch (err) {
    return { trackId, success: false, error: String(err) };
  } finally {
    // Cleanup
    try {
      fs.rmSync(trackTempDir, { recursive: true, force: true });
    } catch {}
  }
}

async function processTracksParallel(
  supabase: SupabaseClient,
  s3Client: S3Client,
  tracks: AudioTrack[],
  tempDir: string,
  concurrency: number,
  stats: ProgressStats,
  force: boolean
): Promise<TranscodeResult[]> {
  const results: TranscodeResult[] = [];
  let currentIndex = 0;
  
  async function processNext(): Promise<void> {
    while (currentIndex < tracks.length && !isShuttingDown) {
      const index = currentIndex++;
      const track = tracks[index];
      
      stats.inProgress++;
      
      try {
        const result = await transcodeTrack(
          supabase,
          s3Client,
          track,
          tempDir,
          index + 1,
          tracks.length,
          force
        );
        
        results.push(result);
        
        if (result.success) {
          stats.completed++;
          if (result.processingTime) {
            stats.processingTimes.push(result.processingTime);
          }
        } else {
          stats.failed++;
          console.error(`   ❌ Failed: ${result.error}`);
        }
        
        if ((stats.completed + stats.failed) % 3 === 0 || index === tracks.length - 1) {
          printProgress(stats);
        }
      } finally {
        stats.inProgress--;
      }
    }
  }
  
  const workers = Array(Math.min(concurrency, tracks.length))
    .fill(null)
    .map(() => processNext());
  
  await Promise.all(workers);
  
  return results;
}

async function runPipeline(options: TranscodeOptions): Promise<void> {
  const concurrency = options.concurrency || 2;
  
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       Multi-Bitrate HLS Ladder Transcoder (32k/64k/96k/128k)       ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔧 Configuration:`);
  console.log(`   Concurrency: ${concurrency} parallel workers`);
  console.log(`   Bitrates: 32k, 64k, 96k, 128k`);
  console.log(`   Segment duration: ${HLS_CONFIG.SEGMENT_DURATION}s`);
  console.log(`   Destination: R2 (${R2_CONFIG.bucketName}/${R2_CONFIG.hlsPath})`);
  
  if (!checkFFmpegInstalled()) {
    console.error('\n❌ FFmpeg is not installed');
    process.exit(1);
  }
  console.log(`\n✓ FFmpeg version: ${getFFmpegVersion()}`);
  
  const supabase = createSupabaseClient();
  console.log('✓ Supabase client initialized');
  
  const s3Client = getS3Client();
  console.log('✓ R2 client initialized');
  
  console.log('\n📋 Fetching tracks...');
  const tracks = await fetchTracksToTranscode(supabase, options);
  
  if (tracks.length === 0) {
    console.log('   ✅ No tracks to process');
    return;
  }
  
  console.log(`   Found ${tracks.length} tracks`);
  
  // Estimate time (~60s per track for 4 variants)
  const estimatedMinutes = Math.round(tracks.length * 60 / concurrency / 60);
  console.log(`   Estimated time: ~${formatDuration(estimatedMinutes * 60)}`);
  
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - would process:');
    tracks.slice(0, 20).forEach(t => {
      const duration = t.duration_seconds ? `${Math.round(t.duration_seconds / 60)}min` : '?min';
      console.log(`   - ${t.track_id}: ${t.metadata?.track_name || 'Unknown'} (${duration})`);
    });
    if (tracks.length > 20) {
      console.log(`   ... and ${tracks.length - 20} more`);
    }
    return;
  }
  
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-ladder-'));
  console.log(`\n📂 Temp directory: ${tempDir}`);
  
  const stats: ProgressStats = {
    total: tracks.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
    startTime: Date.now(),
    processingTimes: [],
  };
  
  console.log('\n🚀 Starting transcoding...\n');
  
  const results = await processTracksParallel(
    supabase, s3Client, tracks, tempDir, concurrency, stats, options.force || false
  );
  
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
  
  // Final Summary
  const totalTime = formatDuration((Date.now() - stats.startTime) / 1000);
  const avgTime = stats.processingTimes.length > 0 
    ? (stats.processingTimes.reduce((a, b) => a + b, 0) / stats.processingTimes.length / 1000).toFixed(1)
    : '?';
  
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Transcoding Complete                             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\n   ✅ Successful: ${stats.completed}`);
  console.log(`   ❌ Failed: ${stats.failed}`);
  console.log(`   📊 Total: ${tracks.length}`);
  console.log(`   ⏱️  Total time: ${totalTime}`);
  console.log(`   📈 Avg time per track: ${avgTime}s`);
  
  if (stats.failed > 0) {
    console.log('\n   Failed tracks:');
    results.filter(r => !r.success).slice(0, 20).forEach(r => {
      console.log(`     - ${r.trackId}: ${r.error?.slice(0, 100)}`);
    });
  }
  
  console.log(`\n   📍 CDN URL format: ${R2_CONFIG.publicUrl}/${R2_CONFIG.hlsPath}/{trackId}/master.m3u8`);
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): TranscodeOptions {
  const args = process.argv.slice(2);
  const options: TranscodeOptions = { concurrency: 2 };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--all': options.all = true; break;
      case '--track': options.trackId = args[++i]; break;
      case '--dry-run': options.dryRun = true; break;
      case '--limit': options.limit = parseInt(args[++i], 10); break;
      case '--concurrency':
      case '-c': options.concurrency = parseInt(args[++i], 10); break;
      case '--force': options.force = true; break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  
  if (!options.all && !options.trackId) {
    console.error('❌ Specify --all or --track <id>');
    process.exit(1);
  }
  
  return options;
}

function printHelp(): void {
  console.log(`
Multi-Bitrate HLS Ladder Transcoder

Creates 4-bitrate HLS ladders (32k/64k/96k/128k) and uploads to R2.

USAGE:
  npx tsx scripts/hls-ladder/transcode-multibitrate-hls.ts [options]

OPTIONS:
  --all              Process all tracks
  --track ID         Process specific track
  --limit N          Limit to N tracks
  --concurrency N    Parallel workers (default: 2)
  -c N               Short for --concurrency
  --force            Re-process even if exists in R2
  --dry-run          Preview without processing
  --help, -h         Show this help

EXAMPLES:
  # Process all tracks
  npx tsx scripts/hls-ladder/transcode-multibitrate-hls.ts --all -c 4

  # Test with one track
  npx tsx scripts/hls-ladder/transcode-multibitrate-hls.ts --track 146644

  # Preview what would be processed
  npx tsx scripts/hls-ladder/transcode-multibitrate-hls.ts --all --dry-run
`);
}

runPipeline(parseArgs()).catch(console.error);
