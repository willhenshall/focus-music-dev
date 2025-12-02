/**
 * HLS Transcoding Script - Production Grade
 * 
 * Converts MP3 audio files to HLS (HTTP Live Streaming) format.
 * This solves the iOS WebKit buffer limitation issue by segmenting
 * audio into small chunks that can be streamed progressively.
 * 
 * Features:
 *   - Parallel processing with configurable concurrency
 *   - Retry logic for network failures
 *   - Progress tracking with ETA
 *   - Graceful shutdown handling
 *   - Resume capability (skips already transcoded tracks)
 * 
 * Usage:
 *   npx tsx scripts/transcode-to-hls.ts --all                    # Transcode all tracks
 *   npx tsx scripts/transcode-to-hls.ts --all --concurrency 8    # Parallel processing
 *   npx tsx scripts/transcode-to-hls.ts --track 123456           # Specific track
 *   npx tsx scripts/transcode-to-hls.ts --large-only             # Only large files
 * 
 * Requirements:
 *   - FFmpeg installed and in PATH
 *   - Supabase credentials in .env
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import 'dotenv/config';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HLS_CONFIG = {
  // Segment duration in seconds (10s is industry standard)
  SEGMENT_DURATION: 10,
  
  // Audio codec and bitrate
  AUDIO_CODEC: 'aac',
  AUDIO_BITRATE: '256k',
  
  // HLS playlist settings
  HLS_LIST_SIZE: 0, // 0 = include all segments in playlist
  
  // Storage bucket names
  SOURCE_BUCKET: 'audio-files',
  HLS_BUCKET: 'audio-hls',
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  
  // Upload batch size (upload segments in batches)
  UPLOAD_BATCH_SIZE: 10,
};

// ============================================================================
// TYPES
// ============================================================================

interface AudioTrack {
  id: string;
  track_id: string;
  file_path: string;
  duration_seconds?: number;
  channel_id?: string;
  metadata?: {
    track_id?: string;
    track_name?: string;
    artist_name?: string;
  };
}

interface TranscodeResult {
  trackId: string;
  success: boolean;
  error?: string;
  hlsPath?: string;
  segmentCount?: number;
  processingTime?: number;
  retries?: number;
}

interface TranscodeOptions {
  all?: boolean;
  trackId?: string;
  channelId?: string;
  largeOnly?: boolean;
  dryRun?: boolean;
  limit?: number;
  concurrency?: number;
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
let activeProcesses = 0;

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Received SIGINT - shutting down gracefully...');
  console.log('   Waiting for active processes to complete...');
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
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function calculateETA(stats: ProgressStats): string {
  if (stats.processingTimes.length < 3) {
    return 'calculating...';
  }
  
  // Use rolling average of last 10 processing times
  const recentTimes = stats.processingTimes.slice(-10);
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
// SUPABASE CLIENT
// ============================================================================

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// ============================================================================
// FFMPEG UTILITIES
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
 * Transcode an MP3 file to HLS format using FFmpeg
 */
async function transcodeToHLS(
  inputPath: string,
  outputDir: string,
  trackId: string
): Promise<{ success: boolean; segmentCount: number; error?: string }> {
  return new Promise((resolve) => {
    const masterPlaylist = path.join(outputDir, 'master.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');
    
    const ffmpegArgs = [
      '-i', inputPath,
      '-c:a', HLS_CONFIG.AUDIO_CODEC,
      '-b:a', HLS_CONFIG.AUDIO_BITRATE,
      '-ar', '44100', // Sample rate
      '-ac', '2', // Stereo
      '-hls_time', HLS_CONFIG.SEGMENT_DURATION.toString(),
      '-hls_list_size', HLS_CONFIG.HLS_LIST_SIZE.toString(),
      '-hls_segment_filename', segmentPattern,
      '-hls_flags', 'independent_segments',
      '-y', // Overwrite output files
      masterPlaylist,
    ];
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: 'pipe' });
    
    let stderr = '';
    ffmpeg.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        // Count segments
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

// ============================================================================
// STORAGE OPERATIONS WITH RETRY
// ============================================================================

async function downloadTrackWithRetry(
  supabase: SupabaseClient,
  filePath: string,
  localPath: string,
  maxRetries: number = HLS_CONFIG.MAX_RETRIES
): Promise<{ success: boolean; retries: number }> {
  let lastError = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Handle different file path formats
      let storagePath = filePath;
      if (filePath.startsWith('http')) {
        const match = filePath.match(/\/audio-files\/(.+)$/);
        if (match) {
          storagePath = match[1];
        } else {
          const urlParts = filePath.split('/');
          storagePath = urlParts[urlParts.length - 1];
        }
      }
      
      const { data, error } = await supabase.storage
        .from(HLS_CONFIG.SOURCE_BUCKET)
        .download(storagePath);
      
      if (error) {
        lastError = error.message;
        if (attempt < maxRetries) {
          console.log(`   ⚠️  Download attempt ${attempt} failed: ${error.message}. Retrying...`);
          await sleep(HLS_CONFIG.RETRY_DELAY_MS * attempt);
          continue;
        }
        return { success: false, retries: attempt };
      }
      
      if (!data) {
        lastError = 'No data returned';
        if (attempt < maxRetries) {
          await sleep(HLS_CONFIG.RETRY_DELAY_MS * attempt);
          continue;
        }
        return { success: false, retries: attempt };
      }
      
      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(localPath, buffer);
      return { success: true, retries: attempt };
      
    } catch (err) {
      lastError = String(err);
      if (attempt < maxRetries) {
        console.log(`   ⚠️  Download attempt ${attempt} failed: ${lastError}. Retrying...`);
        await sleep(HLS_CONFIG.RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }
  
  console.error(`   ❌ Download failed after ${maxRetries} attempts: ${lastError}`);
  return { success: false, retries: maxRetries };
}

async function uploadFileWithRetry(
  supabase: SupabaseClient,
  localPath: string,
  remotePath: string,
  contentType: string,
  maxRetries: number = HLS_CONFIG.MAX_RETRIES
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const fileContent = fs.readFileSync(localPath);
      
      const { error } = await supabase.storage
        .from(HLS_CONFIG.HLS_BUCKET)
        .upload(remotePath, fileContent, {
          contentType,
          upsert: true,
        });
      
      if (error) {
        if (attempt < maxRetries) {
          await sleep(HLS_CONFIG.RETRY_DELAY_MS * attempt);
          continue;
        }
        console.error(`   Failed to upload ${path.basename(remotePath)}: ${error.message}`);
        return false;
      }
      
      return true;
    } catch (err) {
      if (attempt < maxRetries) {
        await sleep(HLS_CONFIG.RETRY_DELAY_MS * attempt);
        continue;
      }
      console.error(`   Upload exception for ${path.basename(remotePath)}: ${err}`);
      return false;
    }
  }
  
  return false;
}

async function uploadHLSFilesWithRetry(
  supabase: SupabaseClient,
  localDir: string,
  trackId: string
): Promise<{ success: boolean; uploadedFiles: number; totalFiles: number; error?: string }> {
  try {
    const files = fs.readdirSync(localDir);
    const totalFiles = files.length;
    let uploadedCount = 0;
    let failedCount = 0;
    
    // Upload in batches for better throughput
    for (let i = 0; i < files.length; i += HLS_CONFIG.UPLOAD_BATCH_SIZE) {
      if (isShuttingDown) {
        return { success: false, uploadedFiles: uploadedCount, totalFiles, error: 'Shutdown requested' };
      }
      
      const batch = files.slice(i, i + HLS_CONFIG.UPLOAD_BATCH_SIZE);
      
      const uploadPromises = batch.map(async (file) => {
        const localPath = path.join(localDir, file);
        const remotePath = `${trackId}/${file}`;
        const contentType = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
        
        const success = await uploadFileWithRetry(supabase, localPath, remotePath, contentType);
        return success;
      });
      
      const results = await Promise.all(uploadPromises);
      uploadedCount += results.filter(r => r).length;
      failedCount += results.filter(r => !r).length;
    }
    
    const success = failedCount === 0;
    return { 
      success, 
      uploadedFiles: uploadedCount, 
      totalFiles,
      error: failedCount > 0 ? `${failedCount} files failed to upload` : undefined
    };
  } catch (err) {
    return { success: false, uploadedFiles: 0, totalFiles: 0, error: String(err) };
  }
}

async function updateTrackHLSStatus(
  supabase: SupabaseClient,
  trackId: string,
  hlsPath: string,
  segmentCount: number
): Promise<boolean> {
  for (let attempt = 1; attempt <= HLS_CONFIG.MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('audio_tracks')
      .update({
        hls_path: hlsPath,
        hls_segment_count: segmentCount,
        hls_transcoded_at: new Date().toISOString(),
      })
      .eq('track_id', trackId);
    
    if (!error) {
      return true;
    }
    
    if (attempt < HLS_CONFIG.MAX_RETRIES) {
      await sleep(HLS_CONFIG.RETRY_DELAY_MS);
      continue;
    }
    
    console.error(`   ⚠️  Database update failed after ${attempt} attempts: ${error.message}`);
    return false;
  }
  
  return false;
}

// ============================================================================
// TRACK FETCHING
// ============================================================================

async function fetchTracksToTranscode(
  supabase: SupabaseClient,
  options: TranscodeOptions
): Promise<AudioTrack[]> {
  let query = supabase
    .from('audio_tracks')
    .select('id, track_id, file_path, duration_seconds, channel_id, metadata')
    .is('deleted_at', null)
    .is('hls_path', null); // Only tracks not yet transcoded
  
  if (options.trackId) {
    query = query.eq('track_id', options.trackId);
  }
  
  if (options.channelId) {
    query = query.eq('channel_id', options.channelId);
  }
  
  // For --large-only, filter by duration
  // NatureBeat tracks are ~45MB at ~25 minutes (high bitrate)
  if (options.largeOnly) {
    query = query.gte('duration_seconds', 1200); // 20+ minutes
  }
  
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch tracks: ${error.message}`);
  }
  
  return data || [];
}

// ============================================================================
// MAIN TRANSCODING PIPELINE
// ============================================================================

async function transcodeTrack(
  supabase: SupabaseClient,
  track: AudioTrack,
  tempDir: string,
  trackIndex: number,
  totalTracks: number
): Promise<TranscodeResult> {
  const startTime = Date.now();
  const trackId = track.track_id || track.metadata?.track_id || track.id;
  const trackName = track.metadata?.track_name || 'Unknown';
  const duration = track.duration_seconds ? Math.round(track.duration_seconds / 60) : null;
  
  console.log(`\n📀 [${trackIndex}/${totalTracks}] Track: ${trackId}`);
  console.log(`   Name: ${trackName}`);
  if (duration) console.log(`   Duration: ${duration} min`);
  
  // Create temp directories
  const trackTempDir = path.join(tempDir, trackId);
  const hlsOutputDir = path.join(trackTempDir, 'hls');
  fs.mkdirSync(hlsOutputDir, { recursive: true });
  
  const localMp3Path = path.join(trackTempDir, 'source.mp3');
  let totalRetries = 0;
  
  try {
    // Step 1: Download MP3 with retry
    console.log('   ⬇️  Downloading...');
    const downloadResult = await downloadTrackWithRetry(supabase, track.file_path, localMp3Path);
    totalRetries += downloadResult.retries - 1;
    
    if (!downloadResult.success) {
      return { trackId, success: false, error: 'Failed to download MP3 after retries', retries: totalRetries };
    }
    
    // Get file size for logging
    const fileSizeMB = (fs.statSync(localMp3Path).size / (1024 * 1024)).toFixed(1);
    console.log(`   ✓ Downloaded (${fileSizeMB} MB)`);
    
    // Step 2: Transcode to HLS
    console.log('   🔄 Transcoding...');
    const transcodeResult = await transcodeToHLS(localMp3Path, hlsOutputDir, trackId);
    if (!transcodeResult.success) {
      return { trackId, success: false, error: transcodeResult.error, retries: totalRetries };
    }
    console.log(`   ✓ Created ${transcodeResult.segmentCount} segments`);
    
    // Step 3: Upload HLS files with retry
    console.log('   ⬆️  Uploading...');
    const uploadResult = await uploadHLSFilesWithRetry(supabase, hlsOutputDir, trackId);
    if (!uploadResult.success) {
      return { trackId, success: false, error: uploadResult.error, retries: totalRetries };
    }
    console.log(`   ✓ Uploaded ${uploadResult.uploadedFiles}/${uploadResult.totalFiles} files`);
    
    // Step 4: Update database
    const hlsPath = `${trackId}/master.m3u8`;
    const dbUpdated = await updateTrackHLSStatus(supabase, trackId, hlsPath, transcodeResult.segmentCount);
    if (!dbUpdated) {
      console.log('   ⚠️  DB update failed but files uploaded - track will be retried');
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`   ✅ Complete in ${(processingTime / 1000).toFixed(1)}s`);
    
    return {
      trackId,
      success: true,
      hlsPath,
      segmentCount: transcodeResult.segmentCount,
      processingTime,
      retries: totalRetries,
    };
  } catch (err) {
    return { trackId, success: false, error: String(err), retries: totalRetries };
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(trackTempDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Process tracks with configurable concurrency using a worker pool pattern
 */
async function processTracksParallel(
  supabase: SupabaseClient,
  tracks: AudioTrack[],
  tempDir: string,
  concurrency: number,
  stats: ProgressStats
): Promise<TranscodeResult[]> {
  const results: TranscodeResult[] = [];
  let currentIndex = 0;
  
  async function processNext(): Promise<void> {
    while (currentIndex < tracks.length && !isShuttingDown) {
      const index = currentIndex++;
      const track = tracks[index];
      
      stats.inProgress++;
      activeProcesses++;
      
      try {
        const result = await transcodeTrack(
          supabase,
          track,
          tempDir,
          index + 1,
          tracks.length
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
        
        // Print progress every 5 tracks or on last track
        if ((stats.completed + stats.failed) % 5 === 0 || index === tracks.length - 1) {
          printProgress(stats);
        }
      } finally {
        stats.inProgress--;
        activeProcesses--;
      }
    }
  }
  
  // Start workers
  const workers = Array(Math.min(concurrency, tracks.length))
    .fill(null)
    .map(() => processNext());
  
  await Promise.all(workers);
  
  return results;
}

async function runTranscodePipeline(options: TranscodeOptions): Promise<void> {
  const concurrency = options.concurrency || 1;
  
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           HLS Audio Transcoding Pipeline - Production              ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔧 Configuration:`);
  console.log(`   Concurrency: ${concurrency} parallel workers`);
  console.log(`   Retries: ${HLS_CONFIG.MAX_RETRIES} attempts per operation`);
  console.log(`   Segment duration: ${HLS_CONFIG.SEGMENT_DURATION}s`);
  
  // Check FFmpeg
  if (!checkFFmpegInstalled()) {
    console.error('\n❌ FFmpeg is not installed or not in PATH');
    console.error('   Install: sudo apt install ffmpeg');
    process.exit(1);
  }
  console.log(`\n✓ FFmpeg version: ${getFFmpegVersion()}`);
  
  // Initialize Supabase
  const supabase = createSupabaseClient();
  console.log('✓ Supabase client initialized');
  
  // Ensure HLS bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const hlsBucketExists = buckets?.some(b => b.name === HLS_CONFIG.HLS_BUCKET);
  if (!hlsBucketExists) {
    console.log(`\n📦 Creating HLS storage bucket: ${HLS_CONFIG.HLS_BUCKET}`);
    await supabase.storage.createBucket(HLS_CONFIG.HLS_BUCKET, {
      public: true,
      fileSizeLimit: 100 * 1024 * 1024,
    });
  }
  
  // Fetch tracks to process
  console.log('\n📋 Fetching tracks to transcode...');
  const tracks = await fetchTracksToTranscode(supabase, options);
  
  if (tracks.length === 0) {
    console.log('   ✅ No tracks found matching criteria (or all already transcoded)');
    return;
  }
  
  console.log(`   Found ${tracks.length} tracks to process`);
  
  // Estimate time
  const estimatedMinutes = Math.round(tracks.length * 1.5 / concurrency);
  console.log(`   Estimated time: ~${formatDuration(estimatedMinutes * 60)} (at ${concurrency}x concurrency)`);
  
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - would process:');
    tracks.slice(0, 20).forEach(t => {
      const duration = t.duration_seconds ? `${Math.round(t.duration_seconds / 60)}min` : '?min';
      console.log(`   - ${t.track_id}: ${t.metadata?.track_name || 'Unknown'} (${duration})`);
    });
    if (tracks.length > 20) {
      console.log(`   ... and ${tracks.length - 20} more tracks`);
    }
    return;
  }
  
  // Create temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-transcode-'));
  console.log(`\n📂 Temp directory: ${tempDir}`);
  
  // Initialize progress stats
  const stats: ProgressStats = {
    total: tracks.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
    startTime: Date.now(),
    processingTimes: [],
  };
  
  console.log('\n🚀 Starting transcoding...\n');
  
  // Process tracks
  const results = await processTracksParallel(supabase, tracks, tempDir, concurrency, stats);
  
  // Cleanup temp directory
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
    if (stats.failed > 20) {
      console.log(`     ... and ${stats.failed - 20} more failed tracks`);
    }
    console.log('\n   💡 Tip: Run the script again to retry failed tracks (they have no hls_path)');
  }
  
  if (isShuttingDown) {
    console.log('\n   ⚠️  Shutdown requested - some tracks may not have been processed');
    console.log('   💡 Run the script again to process remaining tracks');
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): TranscodeOptions {
  const args = process.argv.slice(2);
  const options: TranscodeOptions = {
    concurrency: 1,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--all':
        options.all = true;
        break;
      case '--track':
        options.trackId = args[++i];
        break;
      case '--channel':
        options.channelId = args[++i];
        break;
      case '--large-only':
        options.largeOnly = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--concurrency':
      case '-c':
        options.concurrency = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  
  // Validate concurrency
  if (options.concurrency && (options.concurrency < 1 || options.concurrency > 20)) {
    console.error('❌ Concurrency must be between 1 and 20');
    process.exit(1);
  }
  
  // Validate that at least one selection option is provided
  if (!options.all && !options.trackId && !options.channelId && !options.largeOnly) {
    console.error('❌ Please specify which tracks to transcode:');
    console.error('   --all           Transcode all tracks');
    console.error('   --track ID      Transcode specific track');
    console.error('   --channel ID    Transcode tracks in channel');
    console.error('   --large-only    Only tracks 20+ minutes');
    console.error('\nUse --help for more options');
    process.exit(1);
  }
  
  return options;
}

function printHelp(): void {
  console.log(`
HLS Audio Transcoding Script - Production Grade

Converts MP3 files to HLS (HTTP Live Streaming) format for better
iOS compatibility and streaming performance.

USAGE:
  npx tsx scripts/transcode-to-hls.ts [options]

OPTIONS:
  --all              Transcode all tracks not yet converted
  --track ID         Transcode a specific track by track_id
  --channel ID       Transcode all tracks in a specific channel
  --large-only       Only transcode tracks 20+ minutes
  --limit N          Limit to N tracks
  --concurrency N    Process N tracks in parallel (default: 1, max: 20)
  -c N               Short for --concurrency
  --dry-run          Show what would be transcoded without doing it
  --help, -h         Show this help message

EXAMPLES:
  # Transcode all tracks with 8 parallel workers
  npx tsx scripts/transcode-to-hls.ts --all --concurrency 8

  # Preview what would be transcoded
  npx tsx scripts/transcode-to-hls.ts --all --dry-run

  # Transcode large files only with 4 workers
  npx tsx scripts/transcode-to-hls.ts --large-only -c 4

  # Transcode specific track
  npx tsx scripts/transcode-to-hls.ts --track 146644

RELIABILITY FEATURES:
  - Automatic retry (3 attempts) on network failures
  - Graceful shutdown (Ctrl+C waits for active tasks)
  - Resume capability (skips already transcoded tracks)
  - Progress tracking with ETA

REQUIREMENTS:
  - FFmpeg must be installed and in PATH
  - VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
`);
}

// Main entry point
runTranscodePipeline(parseArgs()).catch(console.error);
