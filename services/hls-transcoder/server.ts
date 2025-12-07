/**
 * HLS Transcoder Service v2.0
 * 
 * Creates 4-bitrate HLS ladders (32k/64k/96k/128k) from MP3 files.
 * 
 * API Endpoints:
 *   POST /api/transcode-sync - Synchronous transcoding (returns HLS files as base64)
 *   GET /health - Health check
 * 
 * Required: FFmpeg must be installed and in PATH
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(os.tmpdir(), 'hls-transcoder');
      fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp3';
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg', 'audio/x-mp3'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.mp3')) {
      cb(null, true);
    } else {
      cb(new Error('Only MP3 files are allowed'));
    }
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// 4-bitrate ladder configuration
const BITRATE_LADDER = [
  { name: 'low', bitrate: 32, bandwidth: 48000 },
  { name: 'medium', bitrate: 64, bandwidth: 96000 },
  { name: 'high', bitrate: 96, bandwidth: 144000 },
  { name: 'premium', bitrate: 128, bandwidth: 192000 },
] as const;

const HLS_CONFIG = {
  SEGMENT_DURATION: 6,
  AUDIO_CODEC: 'aac',
  AUDIO_CHANNELS: 2,
  SAMPLE_RATE: 44100,
};

// Types
interface TranscodeResult {
  success: boolean;
  jobId: string;
  originalFileName: string;
  hlsFolder: string;
  segmentCount: number;
  files: Array<{
    name: string;
    size: number;
    contentType: string;
    data: string; // base64
  }>;
  transcodeDurationMs: number;
  error?: string;
  isMultiBitrate: boolean;
  variants: Array<{
    name: string;
    bitrate: number;
    bandwidth: number;
    segmentCount: number;
  }>;
}

// Check FFmpeg installation
function checkFFmpeg(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
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
        const segmentCount = files.filter((f) => f.endsWith('.ts')).length;
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
 * Generate the master playlist referencing all variants
 */
function generateMasterPlaylist(): string {
  return `#EXTM3U
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
}

/**
 * Read all files from HLS output directory and encode as base64
 */
function collectHLSFiles(hlsDir: string): Array<{
  name: string;
  size: number;
  contentType: string;
  data: string;
}> {
  const files: Array<{ name: string; size: number; contentType: string; data: string }> = [];

  function readDir(dir: string, prefix: string = '') {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativePath = prefix ? `${prefix}/${item}` : item;
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        readDir(fullPath, relativePath);
      } else {
        const contentType = item.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t';
        const data = fs.readFileSync(fullPath);
        files.push({
          name: relativePath,
          size: stat.size,
          contentType,
          data: data.toString('base64'),
        });
      }
    }
  }

  readDir(hlsDir);
  return files;
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const ffmpegOk = checkFFmpeg();
  res.json({
    status: ffmpegOk ? 'healthy' : 'unhealthy',
    version: '2.0.0',
    ffmpeg: ffmpegOk,
    bitrateLadder: BITRATE_LADDER.map((v) => `${v.name}:${v.bitrate}k`).join(', '),
  });
});

// Synchronous transcoding endpoint
app.post('/api/transcode-sync', upload.single('file'), async (req: Request, res: Response) => {
  const startTime = Date.now();
  const jobId = uuidv4();

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const inputPath = req.file.path;
  const originalFileName = req.file.originalname;
  const hlsDir = path.join(os.tmpdir(), 'hls-transcoder', `hls-${jobId}`);

  console.log(`[${jobId}] Starting 4-bitrate transcoding for: ${originalFileName}`);

  try {
    // Create output directories for each variant
    for (const variant of BITRATE_LADDER) {
      fs.mkdirSync(path.join(hlsDir, variant.name), { recursive: true });
    }

    // Transcode each variant
    const variants: TranscodeResult['variants'] = [];
    let totalSegments = 0;

    for (const variant of BITRATE_LADDER) {
      const variantDir = path.join(hlsDir, variant.name);
      console.log(`[${jobId}]   Encoding ${variant.name} (${variant.bitrate}k)...`);

      const result = await transcodeVariant(inputPath, variantDir, variant.bitrate);

      if (!result.success) {
        throw new Error(`Failed to encode ${variant.name}: ${result.error}`);
      }

      variants.push({
        name: variant.name,
        bitrate: variant.bitrate,
        bandwidth: variant.bandwidth,
        segmentCount: result.segmentCount,
      });

      totalSegments += result.segmentCount;
      console.log(`[${jobId}]   ✓ ${variant.name}: ${result.segmentCount} segments`);
    }

    // Generate master playlist
    const masterContent = generateMasterPlaylist();
    fs.writeFileSync(path.join(hlsDir, 'master.m3u8'), masterContent);

    // Collect all files as base64
    const files = collectHLSFiles(hlsDir);
    const transcodeDurationMs = Date.now() - startTime;

    console.log(`[${jobId}] ✅ Complete: ${files.length} files, ${totalSegments} total segments, ${transcodeDurationMs}ms`);

    const response: TranscodeResult = {
      success: true,
      jobId,
      originalFileName,
      hlsFolder: `hls-${jobId}`,
      segmentCount: totalSegments,
      files,
      transcodeDurationMs,
      isMultiBitrate: true,
      variants,
    };

    res.json(response);
  } catch (error: any) {
    console.error(`[${jobId}] ❌ Error:`, error.message);
    res.status(500).json({
      success: false,
      jobId,
      originalFileName,
      hlsFolder: '',
      segmentCount: 0,
      files: [],
      transcodeDurationMs: Date.now() - startTime,
      error: error.message,
      isMultiBitrate: false,
      variants: [],
    });
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(hlsDir)) fs.rmSync(hlsDir, { recursive: true, force: true });
    } catch {}
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

// Start server
app.listen(PORT, () => {
  const ffmpegOk = checkFFmpeg();
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║         HLS Transcoder Service v2.0 (4-Bitrate Ladder)             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📊 Bitrate ladder: ${BITRATE_LADDER.map((v) => `${v.bitrate}k`).join(' / ')}`);
  console.log(`🎵 FFmpeg: ${ffmpegOk ? '✅ Available' : '❌ Not found'}`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   POST /api/transcode-sync - Transcode MP3 to 4-bitrate HLS`);
  console.log(`   GET  /health            - Health check`);
  console.log('');
});

