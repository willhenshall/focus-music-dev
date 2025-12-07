# HLS Transcoder Service v2.0

4-bitrate HLS ladder transcoder for Focus Music. Creates adaptive bitrate streams with 32k/64k/96k/128k AAC variants.

## Bitrate Ladder

| Tier    | Bitrate | Bandwidth | Use Case              |
|---------|---------|-----------|----------------------|
| LOW     | 32 kbps | 48000     | 2G/poor connection   |
| MEDIUM  | 64 kbps | 96000     | 3G/moderate          |
| HIGH    | 96 kbps | 144000    | 4G/good connection   |
| PREMIUM | 128 kbps| 192000    | WiFi/excellent       |

## Output Structure

```
{trackId}/
├── master.m3u8          # Main playlist (references variants)
├── low/
│   ├── index.m3u8       # 32k variant playlist
│   ├── segment_000.ts
│   ├── segment_001.ts
│   └── ...
├── medium/
│   ├── index.m3u8       # 64k variant playlist
│   └── ...
├── high/
│   ├── index.m3u8       # 96k variant playlist
│   └── ...
└── premium/
    ├── index.m3u8       # 128k variant playlist
    └── ...
```

## API Endpoints

### POST /api/transcode-sync

Transcodes an MP3 file to a 4-bitrate HLS ladder synchronously.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `file` - MP3 audio file (max 200MB)

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "originalFileName": "track.mp3",
  "hlsFolder": "hls-uuid",
  "segmentCount": 40,
  "files": [
    {
      "name": "master.m3u8",
      "size": 456,
      "contentType": "application/vnd.apple.mpegurl",
      "data": "base64..."
    },
    {
      "name": "low/index.m3u8",
      "size": 234,
      "contentType": "application/vnd.apple.mpegurl",
      "data": "base64..."
    },
    {
      "name": "low/segment_000.ts",
      "size": 24000,
      "contentType": "video/mp2t",
      "data": "base64..."
    }
  ],
  "transcodeDurationMs": 5432,
  "isMultiBitrate": true,
  "variants": [
    { "name": "low", "bitrate": 32, "bandwidth": 48000, "segmentCount": 10 },
    { "name": "medium", "bitrate": 64, "bandwidth": 96000, "segmentCount": 10 },
    { "name": "high", "bitrate": 96, "bandwidth": 144000, "segmentCount": 10 },
    { "name": "premium", "bitrate": 128, "bandwidth": 192000, "segmentCount": 10 }
  ]
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "ffmpeg": true,
  "bitrateLadder": "low:32k, medium:64k, high:96k, premium:128k"
}
```

## Local Development

### Prerequisites

- Node.js 18+
- FFmpeg installed (`brew install ffmpeg` on macOS)

### Setup

```bash
cd services/hls-transcoder
npm install
npm run dev
```

### Test

```bash
# Upload a test file
curl -X POST -F 'file=@test.mp3' http://localhost:3000/api/transcode-sync | jq
```

## Deployment (Railway)

1. Create a new Railway project
2. Connect this directory as a service
3. Railway will auto-detect the Dockerfile
4. Set environment variable: `PORT=3000` (default)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | 3000    | Server port |

## Integration with Focus Music

In your `.env` file, set:

```env
VITE_HLS_TRANSCODER_URL=https://your-railway-service.railway.app
```

The TrackUploadModal will automatically use this service for HLS transcoding during track uploads.

## FFmpeg Settings

- **Codec:** AAC (mp4a.40.2)
- **Channels:** Stereo (2)
- **Sample Rate:** 44.1 kHz
- **Segment Duration:** 6 seconds
- **Playlist Type:** VOD

## Troubleshooting

### FFmpeg not found

Ensure FFmpeg is installed:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Docker (already included)
```

### Memory Issues

For large files, ensure adequate memory. Railway default should be sufficient for most tracks.

### Timeout Issues

For very long tracks (>30 min), increase timeout settings in your reverse proxy or load balancer.

