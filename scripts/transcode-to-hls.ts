/**
 * HLS Transcoding Script
 * 
 * Converts MP3 audio files to HLS (HTTP Live Streaming) format.
 * This solves the iOS WebKit buffer limitation issue by segmenting
 * audio into small chunks that can be streamed progressively.
 * 
 * Usage:
 *   npx tsx scripts/transcode-to-hls.ts --all           # Transcode all tracks
 *   npx tsx scripts/transcode-to-hls.ts --track 123456  # Transcode specific track
 *   npx tsx scripts/transcode-to-hls.ts --channel abc   # Transcode all tracks in channel
 *   npx tsx scripts/transcode-to-hls.ts --large-only    # Only tracks > 20MB
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
  
  // Parallel processing
  MAX_CONCURRENT: 3,
  
  // Storage bucket names
  SOURCE_BUCKET: 'audio-files',
  HLS_BUCKET: 'audio-hls',
  
  // File size threshold for "large files" mode (20MB)
  LARGE_FILE_THRESHOLD_MB: 20,
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
}

interface TranscodeOptions {
  all?: boolean;
  trackId?: string;
  channelId?: string;
  largeOnly?: boolean;
  dryRun?: boolean;
  limit?: number;
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
// STORAGE OPERATIONS
// ============================================================================

async function downloadTrack(
  supabase: SupabaseClient,
  filePath: string,
  localPath: string
): Promise<boolean> {
  try {
    // Handle different file path formats
    let storagePath = filePath;
    if (filePath.startsWith('http')) {
      // Extract path from URL
      const match = filePath.match(/\/audio-files\/(.+)$/);
      if (match) {
        storagePath = match[1];
      } else {
        // Try to extract just the filename
        const urlParts = filePath.split('/');
        storagePath = urlParts[urlParts.length - 1];
      }
    }
    
    const { data, error } = await supabase.storage
      .from(HLS_CONFIG.SOURCE_BUCKET)
      .download(storagePath);
    
    if (error) {
      console.error(`  Download error: ${error.message}`);
      return false;
    }
    
    if (!data) {
      console.error(`  No data returned for ${storagePath}`);
      return false;
    }
    
    const buffer = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
    return true;
  } catch (err) {
    console.error(`  Download exception: ${err}`);
    return false;
  }
}

async function uploadHLSFiles(
  supabase: SupabaseClient,
  localDir: string,
  trackId: string
): Promise<{ success: boolean; uploadedFiles: number; error?: string }> {
  try {
    const files = fs.readdirSync(localDir);
    let uploadedCount = 0;
    
    for (const file of files) {
      const localPath = path.join(localDir, file);
      const remotePath = `${trackId}/${file}`;
      
      const fileContent = fs.readFileSync(localPath);
      const contentType = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
      
      const { error } = await supabase.storage
        .from(HLS_CONFIG.HLS_BUCKET)
        .upload(remotePath, fileContent, {
          contentType,
          upsert: true,
        });
      
      if (error) {
        console.error(`  Failed to upload ${file}: ${error.message}`);
        continue;
      }
      
      uploadedCount++;
    }
    
    return { success: uploadedCount === files.length, uploadedFiles: uploadedCount };
  } catch (err) {
    return { success: false, uploadedFiles: 0, error: String(err) };
  }
}

async function updateTrackHLSStatus(
  supabase: SupabaseClient,
  trackId: string,
  hlsPath: string,
  segmentCount: number
): Promise<void> {
  // Update the audio_tracks table to mark this track as HLS-ready
  const { error, count } = await supabase
    .from('audio_tracks')
    .update({
      hls_path: hlsPath,
      hls_segment_count: segmentCount,
      hls_transcoded_at: new Date().toISOString(),
    })
    .eq('track_id', trackId);
  
  if (error) {
    console.error(`   ⚠️  Database update failed: ${error.message}`);
  }
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
  
  // For --large-only, filter by duration (long tracks tend to be large files)
  // NatureBeat tracks are ~45-50MB and ~55-60 minutes
  // 40 min threshold catches ~33MB+ files to ensure we get all large tracks
  if (options.largeOnly) {
    query = query.gte('duration_seconds', 2400); // 40+ minutes ≈ 33MB+ files
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
  tempDir: string
): Promise<TranscodeResult> {
  const startTime = Date.now();
  const trackId = track.track_id || track.metadata?.track_id || track.id;
  
  console.log(`\n📀 Processing track: ${trackId}`);
  console.log(`   Name: ${track.metadata?.track_name || 'Unknown'}`);
  console.log(`   Duration: ${track.duration_seconds ? Math.round(track.duration_seconds / 60) + ' min' : 'Unknown'}`);
  
  // Create temp directories
  const trackTempDir = path.join(tempDir, trackId);
  const hlsOutputDir = path.join(trackTempDir, 'hls');
  fs.mkdirSync(hlsOutputDir, { recursive: true });
  
  const localMp3Path = path.join(trackTempDir, 'source.mp3');
  
  try {
    // Step 1: Download MP3
    console.log('   ⬇️  Downloading MP3...');
    const downloaded = await downloadTrack(supabase, track.file_path, localMp3Path);
    if (!downloaded) {
      return { trackId, success: false, error: 'Failed to download MP3' };
    }
    
    // Step 2: Transcode to HLS
    console.log('   🔄 Transcoding to HLS...');
    const transcodeResult = await transcodeToHLS(localMp3Path, hlsOutputDir, trackId);
    if (!transcodeResult.success) {
      return { trackId, success: false, error: transcodeResult.error };
    }
    console.log(`   ✓ Created ${transcodeResult.segmentCount} segments`);
    
    // Step 3: Upload HLS files
    console.log('   ⬆️  Uploading HLS files...');
    const uploadResult = await uploadHLSFiles(supabase, hlsOutputDir, trackId);
    if (!uploadResult.success) {
      return { trackId, success: false, error: uploadResult.error };
    }
    console.log(`   ✓ Uploaded ${uploadResult.uploadedFiles} files`);
    
    // Step 4: Update database
    const hlsPath = `${trackId}/master.m3u8`;
    await updateTrackHLSStatus(supabase, trackId, hlsPath, transcodeResult.segmentCount);
    
    const processingTime = Date.now() - startTime;
    console.log(`   ✅ Complete in ${(processingTime / 1000).toFixed(1)}s`);
    
    return {
      trackId,
      success: true,
      hlsPath,
      segmentCount: transcodeResult.segmentCount,
      processingTime,
    };
  } catch (err) {
    return { trackId, success: false, error: String(err) };
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(trackTempDir, { recursive: true, force: true });
    } catch {}
  }
}

async function runTranscodePipeline(options: TranscodeOptions): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           HLS Audio Transcoding Pipeline                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  // Check FFmpeg
  if (!checkFFmpegInstalled()) {
    console.error('\n❌ FFmpeg is not installed or not in PATH');
    console.error('   Install FFmpeg: https://ffmpeg.org/download.html');
    console.error('   macOS: brew install ffmpeg');
    console.error('   Ubuntu: sudo apt install ffmpeg');
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
      fileSizeLimit: 100 * 1024 * 1024, // 100MB limit per file
    });
  }
  
  // Fetch tracks to process
  console.log('\n📋 Fetching tracks to transcode...');
  const tracks = await fetchTracksToTranscode(supabase, options);
  
  if (tracks.length === 0) {
    console.log('   No tracks found matching criteria (or all already transcoded)');
    return;
  }
  
  console.log(`   Found ${tracks.length} tracks to process`);
  
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - would process:');
    tracks.forEach(t => {
      console.log(`   - ${t.track_id}: ${t.metadata?.track_name || 'Unknown'}`);
    });
    return;
  }
  
  // Create temp directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-transcode-'));
  console.log(`\n📂 Temp directory: ${tempDir}`);
  
  // Process tracks
  const results: TranscodeResult[] = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < tracks.length; i++) {
    console.log(`\n━━━ Track ${i + 1} of ${tracks.length} ━━━`);
    const result = await transcodeTrack(supabase, tracks[i], tempDir);
    results.push(result);
    
    if (result.success) {
      successCount++;
    } else {
      failCount++;
      console.error(`   ❌ Failed: ${result.error}`);
    }
  }
  
  // Cleanup temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
  
  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    Transcoding Complete                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   📊 Total: ${tracks.length}`);
  
  if (failCount > 0) {
    console.log('\n   Failed tracks:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`     - ${r.trackId}: ${r.error}`);
    });
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): TranscodeOptions {
  const args = process.argv.slice(2);
  const options: TranscodeOptions = {};
  
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
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  
  // Validate that at least one selection option is provided
  if (!options.all && !options.trackId && !options.channelId && !options.largeOnly) {
    console.error('❌ Please specify which tracks to transcode:');
    console.error('   --all         Transcode all tracks');
    console.error('   --track ID    Transcode specific track');
    console.error('   --channel ID  Transcode tracks in channel');
    console.error('   --large-only  Only tracks > 20MB');
    console.error('\nUse --help for more options');
    process.exit(1);
  }
  
  return options;
}

function printHelp(): void {
  console.log(`
HLS Audio Transcoding Script

Converts MP3 files to HLS (HTTP Live Streaming) format for better
iOS compatibility and streaming performance.

USAGE:
  npx tsx scripts/transcode-to-hls.ts [options]

OPTIONS:
  --all           Transcode all tracks not yet converted
  --track ID      Transcode a specific track by track_id
  --channel ID    Transcode all tracks in a specific channel
  --large-only    Only transcode files larger than 20MB
  --limit N       Limit to N tracks
  --dry-run       Show what would be transcoded without doing it
  --help, -h      Show this help message

EXAMPLES:
  # Transcode all large files first (recommended for NatureBeat)
  npx tsx scripts/transcode-to-hls.ts --large-only

  # Transcode everything
  npx tsx scripts/transcode-to-hls.ts --all

  # Preview what would be transcoded
  npx tsx scripts/transcode-to-hls.ts --all --dry-run

  # Transcode specific track
  npx tsx scripts/transcode-to-hls.ts --track 146644

REQUIREMENTS:
  - FFmpeg must be installed and in PATH
  - VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
`);
}

// Main entry point
runTranscodePipeline(parseArgs()).catch(console.error);
