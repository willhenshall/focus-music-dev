/**
 * Sync HLS Ladder Files from R2 to Supabase Storage
 * 
 * After transcoding creates HLS ladders in R2, this script syncs them
 * to Supabase Storage for backup/redundancy.
 * 
 * Usage:
 *   npx tsx scripts/hls-ladder/sync-hls-r2-to-supabase.ts --all
 *   npx tsx scripts/hls-ladder/sync-hls-r2-to-supabase.ts --track <track-id>
 *   npx tsx scripts/hls-ladder/sync-hls-r2-to-supabase.ts --all --dry-run
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import 'dotenv/config';

// ============================================================================
// CONFIGURATION
// ============================================================================

const R2_CONFIG = {
  accountId: "531f033f1f3eb591e89baff98f027cee",
  bucketName: "focus-music-audio",
  accessKeyId: "d6c3feb94bb923b619c9661f950019d2",
  secretAccessKey: "bc5d2ea0d38fecb4ef8442b78621a6b398415b3373cc1c174b12564a111678f3",
  hlsPath: "hls",
};

const SUPABASE_BUCKET = 'audio-hls-ladder'; // New bucket for multi-bitrate HLS

const SYNC_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  UPLOAD_BATCH_SIZE: 20,
};

// ============================================================================
// TYPES
// ============================================================================

interface SyncOptions {
  all?: boolean;
  trackId?: string;
  dryRun?: boolean;
  limit?: number;
  concurrency?: number;
}

interface SyncResult {
  trackId: string;
  success: boolean;
  error?: string;
  filesUploaded?: number;
}

interface ProgressStats {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  startTime: number;
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

let isShuttingDown = false;

process.on('SIGINT', () => {
  console.log('\n⚠️  Shutting down...');
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
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
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
// R2 OPERATIONS
// ============================================================================

async function listR2HLSTracks(s3Client: S3Client): Promise<string[]> {
  const trackIds = new Set<string>();
  let continuationToken: string | undefined;
  
  do {
    const command = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      Prefix: `${R2_CONFIG.hlsPath}/`,
      Delimiter: '/',
      ContinuationToken: continuationToken,
    });
    
    const response = await s3Client.send(command);
    
    // Extract track IDs from common prefixes (folders)
    for (const prefix of response.CommonPrefixes || []) {
      if (prefix.Prefix) {
        const trackId = prefix.Prefix.replace(`${R2_CONFIG.hlsPath}/`, '').replace('/', '');
        if (trackId) trackIds.add(trackId);
      }
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  
  return Array.from(trackIds);
}

async function listR2TrackFiles(s3Client: S3Client, trackId: string): Promise<string[]> {
  const files: string[] = [];
  let continuationToken: string | undefined;
  
  do {
    const command = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      Prefix: `${R2_CONFIG.hlsPath}/${trackId}/`,
      ContinuationToken: continuationToken,
    });
    
    const response = await s3Client.send(command);
    
    for (const obj of response.Contents || []) {
      if (obj.Key) {
        // Get relative path within track folder
        const relativePath = obj.Key.replace(`${R2_CONFIG.hlsPath}/${trackId}/`, '');
        if (relativePath) files.push(relativePath);
      }
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  
  return files;
}

async function downloadFromR2(
  s3Client: S3Client,
  key: string
): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= SYNC_CONFIG.MAX_RETRIES; attempt++) {
    try {
      const command = new GetObjectCommand({
        Bucket: R2_CONFIG.bucketName,
        Key: key,
      });
      
      const response = await s3Client.send(command);
      
      if (response.Body) {
        const chunks: Uint8Array[] = [];
        // @ts-ignore
        for await (const chunk of response.Body) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      }
    } catch (err) {
      if (attempt < SYNC_CONFIG.MAX_RETRIES) {
        await sleep(SYNC_CONFIG.RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }
  return null;
}

// ============================================================================
// SUPABASE OPERATIONS
// ============================================================================

async function ensureBucketExists(supabase: SupabaseClient): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some(b => b.name === SUPABASE_BUCKET);
  
  if (!exists) {
    console.log(`   Creating Supabase bucket: ${SUPABASE_BUCKET}`);
    await supabase.storage.createBucket(SUPABASE_BUCKET, {
      public: true,
      fileSizeLimit: 100 * 1024 * 1024,
    });
  }
}

async function uploadToSupabase(
  supabase: SupabaseClient,
  data: Buffer,
  remotePath: string
): Promise<boolean> {
  const contentType = remotePath.endsWith('.m3u8') 
    ? 'application/vnd.apple.mpegurl' 
    : 'video/mp2t';
  
  for (let attempt = 1; attempt <= SYNC_CONFIG.MAX_RETRIES; attempt++) {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(remotePath, data, {
        contentType,
        upsert: true,
      });
    
    if (!error) return true;
    
    if (attempt < SYNC_CONFIG.MAX_RETRIES) {
      await sleep(SYNC_CONFIG.RETRY_DELAY_MS * attempt);
      continue;
    }
    console.error(`   Failed to upload ${remotePath}: ${error.message}`);
  }
  return false;
}

// ============================================================================
// SYNC PIPELINE
// ============================================================================

async function syncTrack(
  s3Client: S3Client,
  supabase: SupabaseClient,
  trackId: string,
  trackIndex: number,
  totalTracks: number
): Promise<SyncResult> {
  console.log(`\n📀 [${trackIndex}/${totalTracks}] Syncing: ${trackId}`);
  
  try {
    // List all files for this track in R2
    const files = await listR2TrackFiles(s3Client, trackId);
    
    if (files.length === 0) {
      return { trackId, success: false, error: 'No files found in R2' };
    }
    
    console.log(`   Found ${files.length} files`);
    
    let uploadedCount = 0;
    let failedCount = 0;
    
    // Process files in batches
    for (let i = 0; i < files.length; i += SYNC_CONFIG.UPLOAD_BATCH_SIZE) {
      if (isShuttingDown) {
        return { trackId, success: false, error: 'Shutdown requested' };
      }
      
      const batch = files.slice(i, i + SYNC_CONFIG.UPLOAD_BATCH_SIZE);
      
      const promises = batch.map(async (file) => {
        const r2Key = `${R2_CONFIG.hlsPath}/${trackId}/${file}`;
        const supabasePath = `${trackId}/${file}`;
        
        const data = await downloadFromR2(s3Client, r2Key);
        if (!data) return false;
        
        return uploadToSupabase(supabase, data, supabasePath);
      });
      
      const results = await Promise.all(promises);
      uploadedCount += results.filter(r => r).length;
      failedCount += results.filter(r => !r).length;
    }
    
    if (failedCount > 0) {
      return { 
        trackId, 
        success: false, 
        error: `${failedCount}/${files.length} files failed`,
        filesUploaded: uploadedCount,
      };
    }
    
    console.log(`   ✓ Synced ${uploadedCount} files to Supabase`);
    return { trackId, success: true, filesUploaded: uploadedCount };
  } catch (err) {
    return { trackId, success: false, error: String(err) };
  }
}

async function runSyncPipeline(options: SyncOptions): Promise<void> {
  const concurrency = options.concurrency || 5;
  
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       Sync HLS Ladders: R2 → Supabase Storage                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\n🔧 Configuration:`);
  console.log(`   Source: R2 (${R2_CONFIG.bucketName}/${R2_CONFIG.hlsPath})`);
  console.log(`   Destination: Supabase (${SUPABASE_BUCKET})`);
  console.log(`   Concurrency: ${concurrency}`);
  
  const supabase = createSupabaseClient();
  console.log('\n✓ Supabase client initialized');
  
  const s3Client = getS3Client();
  console.log('✓ R2 client initialized');
  
  // Ensure Supabase bucket exists
  await ensureBucketExists(supabase);
  console.log(`✓ Supabase bucket ready: ${SUPABASE_BUCKET}`);
  
  // Get tracks to sync
  console.log('\n📋 Listing tracks in R2...');
  let trackIds: string[];
  
  if (options.trackId) {
    trackIds = [options.trackId];
  } else {
    trackIds = await listR2HLSTracks(s3Client);
  }
  
  if (options.limit && trackIds.length > options.limit) {
    trackIds = trackIds.slice(0, options.limit);
  }
  
  console.log(`   Found ${trackIds.length} tracks`);
  
  if (trackIds.length === 0) {
    console.log('   ✅ No tracks to sync');
    return;
  }
  
  if (options.dryRun) {
    console.log('\n🔍 DRY RUN - would sync:');
    trackIds.slice(0, 20).forEach(id => console.log(`   - ${id}`));
    if (trackIds.length > 20) {
      console.log(`   ... and ${trackIds.length - 20} more`);
    }
    return;
  }
  
  const stats: ProgressStats = {
    total: trackIds.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
    startTime: Date.now(),
  };
  
  console.log('\n🚀 Starting sync...');
  
  // Process tracks with concurrency
  const results: SyncResult[] = [];
  let currentIndex = 0;
  
  async function processNext(): Promise<void> {
    while (currentIndex < trackIds.length && !isShuttingDown) {
      const index = currentIndex++;
      const trackId = trackIds[index];
      
      stats.inProgress++;
      
      const result = await syncTrack(s3Client, supabase, trackId, index + 1, trackIds.length);
      results.push(result);
      
      if (result.success) {
        stats.completed++;
      } else {
        stats.failed++;
        console.error(`   ❌ ${result.error}`);
      }
      
      stats.inProgress--;
    }
  }
  
  const workers = Array(Math.min(concurrency, trackIds.length))
    .fill(null)
    .map(() => processNext());
  
  await Promise.all(workers);
  
  // Summary
  const totalTime = formatDuration((Date.now() - stats.startTime) / 1000);
  
  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    Sync Complete                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\n   ✅ Successful: ${stats.completed}`);
  console.log(`   ❌ Failed: ${stats.failed}`);
  console.log(`   📊 Total: ${trackIds.length}`);
  console.log(`   ⏱️  Time: ${totalTime}`);
  
  if (stats.failed > 0) {
    console.log('\n   Failed tracks:');
    results.filter(r => !r.success).slice(0, 10).forEach(r => {
      console.log(`     - ${r.trackId}: ${r.error}`);
    });
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  const options: SyncOptions = { concurrency: 5 };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--all': options.all = true; break;
      case '--track': options.trackId = args[++i]; break;
      case '--dry-run': options.dryRun = true; break;
      case '--limit': options.limit = parseInt(args[++i], 10); break;
      case '--concurrency':
      case '-c': options.concurrency = parseInt(args[++i], 10); break;
      case '--help':
      case '-h':
        console.log(`
Sync HLS Ladders from R2 to Supabase Storage

USAGE:
  npx tsx scripts/hls-ladder/sync-hls-r2-to-supabase.ts [options]

OPTIONS:
  --all              Sync all tracks
  --track ID         Sync specific track
  --limit N          Limit to N tracks
  --concurrency N    Parallel workers (default: 5)
  --dry-run          Preview without syncing
`);
        process.exit(0);
    }
  }
  
  if (!options.all && !options.trackId) {
    console.error('❌ Specify --all or --track <id>');
    process.exit(1);
  }
  
  return options;
}

runSyncPipeline(parseArgs()).catch(console.error);
