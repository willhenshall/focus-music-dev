/**
 * HLS to CDN Sync Script
 * 
 * Syncs HLS files from Supabase Storage (audio-hls bucket) to Cloudflare R2 CDN.
 * This enables faster HLS streaming from the CDN instead of Supabase Storage.
 * 
 * Features:
 *   - Parallel processing with configurable concurrency
 *   - Retry logic for network failures
 *   - Progress tracking with ETA
 *   - Resume capability (skips already synced tracks)
 * 
 * Usage:
 *   npx tsx scripts/sync-hls-to-cdn.ts --all                    # Sync all HLS tracks
 *   npx tsx scripts/sync-hls-to-cdn.ts --all --concurrency 10   # Parallel processing
 *   npx tsx scripts/sync-hls-to-cdn.ts --track 123456           # Specific track
 *   npx tsx scripts/sync-hls-to-cdn.ts --all --dry-run          # Preview only
 * 
 * Requirements:
 *   - VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import 'dotenv/config';

// ============================================================================
// CONFIGURATION
// ============================================================================

const R2_CONFIG = {
  accountId: "531f033f1f3eb591e89baff98f027cee",
  bucketName: "focus-music-audio",
  accessKeyId: "d6c3feb94bb923b619c9661f950019d2",
  secretAccessKey: "bc5d2ea0d38fecb4ef8442b78621a6b398415b3373cc1c174b12564a111678f3",
  publicUrl: "https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev",
  hlsPath: "hls",
};

const SYNC_CONFIG = {
  SOURCE_BUCKET: 'audio-hls',
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  UPLOAD_BATCH_SIZE: 20,
};

// ============================================================================
// TYPES
// ============================================================================

interface HLSTrack {
  track_id: string;
  hls_path: string;
  hls_segment_count: number;
  hls_cdn_url?: string;
}

interface SyncResult {
  trackId: string;
  success: boolean;
  error?: string;
  cdnUrl?: string;
  filesUploaded?: number;
  processingTime?: number;
}

interface SyncOptions {
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
// CLIENTS
// ============================================================================

function createSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
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
// SUPABASE STORAGE OPERATIONS
// ============================================================================

async function listHLSFiles(
  supabase: SupabaseClient,
  trackId: string
): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(SYNC_CONFIG.SOURCE_BUCKET)
    .list(trackId);
  
  if (error) {
    throw new Error(`Failed to list files for track ${trackId}: ${error.message}`);
  }
  
  return (data || []).map(file => file.name);
}

async function downloadHLSFile(
  supabase: SupabaseClient,
  trackId: string,
  fileName: string
): Promise<Blob | null> {
  const filePath = `${trackId}/${fileName}`;
  
  for (let attempt = 1; attempt <= SYNC_CONFIG.MAX_RETRIES; attempt++) {
    const { data, error } = await supabase.storage
      .from(SYNC_CONFIG.SOURCE_BUCKET)
      .download(filePath);
    
    if (error) {
      if (attempt < SYNC_CONFIG.MAX_RETRIES) {
        await sleep(SYNC_CONFIG.RETRY_DELAY_MS * attempt);
        continue;
      }
      console.error(`   Failed to download ${filePath}: ${error.message}`);
      return null;
    }
    
    return data;
  }
  
  return null;
}

// ============================================================================
// R2 UPLOAD OPERATIONS
// ============================================================================

async function uploadToR2(
  s3Client: S3Client,
  trackId: string,
  fileName: string,
  fileData: Blob
): Promise<boolean> {
  const key = `${R2_CONFIG.hlsPath}/${trackId}/${fileName}`;
  
  for (let attempt = 1; attempt <= SYNC_CONFIG.MAX_RETRIES; attempt++) {
    try {
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      const contentType = fileName.endsWith('.m3u8') 
        ? 'application/vnd.apple.mpegurl' 
        : 'video/mp2t';
      
      const command = new PutObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
      
      await s3Client.send(command);
      return true;
    } catch (err) {
      if (attempt < SYNC_CONFIG.MAX_RETRIES) {
        await sleep(SYNC_CONFIG.RETRY_DELAY_MS * attempt);
        continue;
      }
      console.error(`   Failed to upload ${key}: ${err}`);
      return false;
    }
  }
  
  return false;
}

async function checkR2FileExists(
  s3Client: S3Client,
  trackId: string,
  fileName: string
): Promise<boolean> {
  const key = `${R2_CONFIG.hlsPath}/${trackId}/${fileName}`;
  
  try {
    const command = new HeadObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function fetchTracksToSync(
  supabase: SupabaseClient,
  options: SyncOptions
): Promise<HLSTrack[]> {
  const PAGE_SIZE = 1000;
  let allTracks: HLSTrack[] = [];
  let offset = 0;
  let hasMore = true;
  
  console.log('   Fetching tracks with HLS files (paginated)...');
  
  while (hasMore) {
    let query = supabase
      .from('audio_tracks')
      .select('track_id, hls_path, hls_segment_count, hls_cdn_url')
      .is('deleted_at', null)
      .not('hls_path', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    
    if (options.trackId) {
      query = query.eq('track_id', options.trackId);
    }
    
    // Skip already synced unless --force
    if (!options.force) {
      query = query.is('hls_cdn_url', null);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch tracks: ${error.message}`);
    }
    
    if (data && data.length > 0) {
      allTracks = allTracks.concat(data as HLSTrack[]);
      console.log(`   ... fetched ${allTracks.length} tracks so far`);
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

async function updateTrackCDNUrl(
  supabase: SupabaseClient,
  trackId: string,
  cdnUrl: string
): Promise<boolean> {
  for (let attempt = 1; attempt <= SYNC_CONFIG.MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('audio_tracks')
      .update({
        hls_cdn_url: cdnUrl,
      })
      .eq('track_id', trackId);
    
    if (!error) {
      return true;
    }
    
    if (attempt < SYNC_CONFIG.MAX_RETRIES) {
      await sleep(SYNC_CONFIG.RETRY_DELAY_MS);
      continue;
    }
    
    console.error(`   ⚠️  Database update failed: ${error.message}`);
    return false;
  }
  
  return false;
}

// ============================================================================
// MAIN SYNC PIPELINE
// ============================================================================

async function syncTrack(
  supabase: SupabaseClient,
  s3Client: S3Client,
  track: HLSTrack,
  trackIndex: number,
  totalTracks: number
): Promise<SyncResult> {
  const startTime = Date.now();
  const trackId = track.track_id;
  
  console.log(`\n📀 [${trackIndex}/${totalTracks}] Track: ${trackId}`);
  console.log(`   HLS Path: ${track.hls_path}`);
  console.log(`   Segments: ${track.hls_segment_count}`);
  
  try {
    // Step 1: List all HLS files for this track
    console.log('   📋 Listing files...');
    const files = await listHLSFiles(supabase, trackId);
    
    if (files.length === 0) {
      return { trackId, success: false, error: 'No HLS files found' };
    }
    console.log(`   ✓ Found ${files.length} files`);
    
    // Step 2: Download and upload each file
    console.log('   ⬆️  Syncing to CDN...');
    let uploadedCount = 0;
    let failedCount = 0;
    
    // Process in batches
    for (let i = 0; i < files.length; i += SYNC_CONFIG.UPLOAD_BATCH_SIZE) {
      if (isShuttingDown) {
        return { trackId, success: false, error: 'Shutdown requested' };
      }
      
      const batch = files.slice(i, i + SYNC_CONFIG.UPLOAD_BATCH_SIZE);
      
      const uploadPromises = batch.map(async (fileName) => {
        const fileData = await downloadHLSFile(supabase, trackId, fileName);
        if (!fileData) {
          return false;
        }
        
        const uploaded = await uploadToR2(s3Client, trackId, fileName, fileData);
        return uploaded;
      });
      
      const results = await Promise.all(uploadPromises);
      uploadedCount += results.filter(r => r).length;
      failedCount += results.filter(r => !r).length;
    }
    
    if (failedCount > 0) {
      return { 
        trackId, 
        success: false, 
        error: `${failedCount}/${files.length} files failed to upload`,
        filesUploaded: uploadedCount,
      };
    }
    
    console.log(`   ✓ Uploaded ${uploadedCount}/${files.length} files`);
    
    // Step 3: Update database with CDN URL
    const cdnUrl = `${R2_CONFIG.publicUrl}/${R2_CONFIG.hlsPath}/${trackId}/master.m3u8`;
    await updateTrackCDNUrl(supabase, trackId, cdnUrl);
    
    const processingTime = Date.now() - startTime;
    console.log(`   ✅ Complete in ${(processingTime / 1000).toFixed(1)}s`);
    
    return {
      trackId,
      success: true,
      cdnUrl,
      filesUploaded: uploadedCount,
      processingTime,
    };
  } catch (err) {
    return { trackId, success: false, error: String(err) };
  }
}

async function processTracksParallel(
  supabase: SupabaseClient,
  s3Client: S3Client,
  tracks: HLSTrack[],
  concurrency: number,
  stats: ProgressStats
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  let currentIndex = 0;
  
  async function processNext(): Promise<void> {
    while (currentIndex < tracks.length && !isShuttingDown) {
      const index = currentIndex++;
      const track = tracks[index];
      
      stats.inProgress++;
      
      try {
        const result = await syncTrack(
          supabase,
          s3Client,
          track,
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
        
        if ((stats.completed + stats.failed) % 10 === 0 || index === tracks.length - 1) {
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

async function runSyncPipeline(options: SyncOptions): Promise<void> {
  const concurrency = options.concurrency || 10;
  
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           HLS to CDN Sync Pipeline                                  ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔧 Configuration:`);
  console.log(`   Concurrency: ${concurrency} parallel workers`);
  console.log(`   Source: Supabase Storage (${SYNC_CONFIG.SOURCE_BUCKET})`);
  console.log(`   Destination: Cloudflare R2 (${R2_CONFIG.bucketName}/${R2_CONFIG.hlsPath})`);
  console.log(`   CDN URL: ${R2_CONFIG.publicUrl}/${R2_CONFIG.hlsPath}/`);
  
  // Initialize clients
  const supabase = createSupabaseClient();
  console.log('\n✓ Supabase client initialized');
  
  const s3Client = getS3Client();
  console.log('✓ R2 client initialized');
  
  // Fetch tracks to sync
  console.log('\n📋 Fetching tracks to sync...');
  const tracks = await fetchTracksToSync(supabase, options);
  
  if (tracks.length === 0) {
    console.log('   ✅ No tracks to sync (all already synced or none have HLS)');
    return;
  }
  
  console.log(`   Found ${tracks.length} tracks to sync`);
  
  // Estimate time (roughly 5 seconds per track with parallel)
  const estimatedMinutes = Math.round(tracks.length * 5 / concurrency / 60);
  console.log(`   Estimated time: ~${formatDuration(estimatedMinutes * 60)} (at ${concurrency}x concurrency)`);
  
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - would sync:');
    tracks.slice(0, 20).forEach(t => {
      console.log(`   - ${t.track_id}: ${t.hls_segment_count} segments`);
    });
    if (tracks.length > 20) {
      console.log(`   ... and ${tracks.length - 20} more tracks`);
    }
    return;
  }
  
  // Initialize progress stats
  const stats: ProgressStats = {
    total: tracks.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
    startTime: Date.now(),
    processingTimes: [],
  };
  
  console.log('\n🚀 Starting sync...\n');
  
  // Process tracks
  const results = await processTracksParallel(supabase, s3Client, tracks, concurrency, stats);
  
  // Final Summary
  const totalTime = formatDuration((Date.now() - stats.startTime) / 1000);
  const avgTime = stats.processingTimes.length > 0 
    ? (stats.processingTimes.reduce((a, b) => a + b, 0) / stats.processingTimes.length / 1000).toFixed(1)
    : '?';
  
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    CDN Sync Complete                                ║');
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
    console.log('\n   💡 Tip: Run the script again to retry failed tracks');
  }
  
  if (isShuttingDown) {
    console.log('\n   ⚠️  Shutdown requested - some tracks may not have been processed');
    console.log('   💡 Run the script again to process remaining tracks');
  }
  
  console.log(`\n   📍 CDN URL format: ${R2_CONFIG.publicUrl}/${R2_CONFIG.hlsPath}/{trackId}/master.m3u8`);
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const options: SyncOptions = {
    concurrency: 10,
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
      case '--force':
        options.force = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  
  if (options.concurrency && (options.concurrency < 1 || options.concurrency > 50)) {
    console.error('❌ Concurrency must be between 1 and 50');
    process.exit(1);
  }
  
  if (!options.all && !options.trackId) {
    console.error('❌ Please specify which tracks to sync:');
    console.error('   --all           Sync all HLS tracks');
    console.error('   --track ID      Sync specific track');
    console.error('\nUse --help for more options');
    process.exit(1);
  }
  
  return options;
}

function printHelp(): void {
  console.log(`
HLS to CDN Sync Script

Syncs HLS files from Supabase Storage to Cloudflare R2 CDN for faster
streaming delivery.

USAGE:
  npx tsx scripts/sync-hls-to-cdn.ts [options]

OPTIONS:
  --all              Sync all tracks with HLS files
  --track ID         Sync a specific track by track_id
  --limit N          Limit to N tracks
  --concurrency N    Process N tracks in parallel (default: 10, max: 50)
  -c N               Short for --concurrency
  --force            Re-sync even if already synced
  --dry-run          Show what would be synced without doing it
  --help, -h         Show this help message

EXAMPLES:
  # Sync all HLS tracks with 10 parallel workers
  npx tsx scripts/sync-hls-to-cdn.ts --all --concurrency 10

  # Preview what would be synced
  npx tsx scripts/sync-hls-to-cdn.ts --all --dry-run

  # Sync specific track
  npx tsx scripts/sync-hls-to-cdn.ts --track 146644

  # Re-sync tracks even if already synced
  npx tsx scripts/sync-hls-to-cdn.ts --all --force

CDN URL FORMAT:
  https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/hls/{trackId}/master.m3u8

REQUIREMENTS:
  - VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
`);
}

// Main entry point
runSyncPipeline(parseArgs()).catch(console.error);
