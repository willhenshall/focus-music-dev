# Audio Engine Migration Guide

This document describes the migration from the legacy `EnterpriseAudioEngine` to the new `StreamingAudioEngine` with HLS support.

## Overview

The new audio engine architecture solves the iOS WebKit buffer limitation issue (~22MB) that caused playback failures with large files (50MB+ NatureBeat tracks) by implementing:

1. **HLS Streaming**: Audio is segmented into small chunks, preventing buffer overflow
2. **Explicit Buffer Control**: Application-level buffer management
3. **Native Fallback**: Capacitor integration for native AVPlayer/ExoPlayer when available

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     MusicPlayerContext                          │
│                    (Engine Abstraction)                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Enterprise    │ │   Streaming     │ │   Native        │
│   AudioEngine   │ │   AudioEngine   │ │   AudioBridge   │
│   (Legacy)      │ │   (HLS/Web)     │ │   (Capacitor)   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  HTML5 Audio    │ │   hls.js /      │ │   AVPlayer /    │
│  (Direct MP3)   │ │   Native HLS    │ │   ExoPlayer     │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## File Structure

```
src/lib/
├── enterpriseAudioEngine.ts    # Legacy engine (to be deprecated)
├── streamingAudioEngine.ts     # New HLS-based engine
├── bufferController.ts         # Explicit buffer management
├── nativeAudioBridge.ts        # Capacitor native bridge
├── nativeAudioWeb.ts           # Web fallback for native bridge
├── storageAdapters.ts          # Updated with HLS URL support
└── types/
    └── audioEngine.ts          # Shared type definitions

scripts/
└── transcode-to-hls.ts         # FFmpeg transcoding pipeline

supabase/migrations/
├── 20251202000001_add_hls_streaming_columns.sql
└── 20251202000002_create_hls_storage_bucket.sql
```

## Migration Steps

### Step 1: Install Dependencies

```bash
npm install hls.js @capacitor/core @capacitor/cli
```

### Step 2: Run Database Migrations

Apply the new migrations to add HLS columns and storage bucket:

```bash
npx supabase db push
```

### Step 3: Transcode Audio to HLS

Start with large files (which cause iOS issues):

```bash
# Transcode only files > 20MB (recommended first)
npm run transcode-hls:large

# Or transcode all tracks
npm run transcode-hls:all
```

### Step 4: Enable Streaming Engine

The engine selection is controlled by:

1. **Environment Variable**: `VITE_AUDIO_ENGINE_TYPE`
   - `legacy` - Use EnterpriseAudioEngine
   - `streaming` - Use StreamingAudioEngine
   - `auto` - Use streaming on iOS, legacy elsewhere (default)

2. **Local Storage**: `audioEngineType` (per-user override)

3. **Debug Console**: `window.__playerDebug.switchEngine('streaming')`

### Step 5: A/B Testing

Monitor metrics between engines:

```typescript
// In browser console
window.__playerDebug.getEngineType()     // Current engine
window.__playerDebug.isStreamingEngine() // Boolean
window.__playerDebug.getMetrics()        // Full metrics
window.__playerDebug.getHLSMetrics()     // HLS-specific metrics
```

### Step 6: Monitor and Validate

Key metrics to monitor:

| Metric | Legacy | Streaming | Target |
|--------|--------|-----------|--------|
| iOS buffer crashes | > 0 | 0 | 0 |
| Load time (p50) | ~2s | ~1s | < 1.5s |
| Rebuffering events | Variable | Low | < 2/track |
| Success rate | 95% | 99%+ | > 99% |

### Step 7: Full Rollout

Once validated:

```bash
# Set environment for production
VITE_AUDIO_ENGINE_TYPE=streaming
```

### Step 8: Cleanup (Optional)

After full migration, remove legacy code:

- `src/lib/enterpriseAudioEngine.ts`
- `src/lib/iosBufferClamp.ts`
- `src/lib/iosWebkitDetection.ts`

## Configuration

### HLS Configuration

```typescript
// Default HLS config (in streamingAudioEngine.ts)
const DEFAULT_HLS_CONFIG = {
  maxBufferLength: 30,           // Buffer 30 seconds ahead
  maxMaxBufferLength: 60,        // Never buffer more than 60 seconds
  maxBufferSize: 15_000_000,     // 15MB max - safe for iOS
  maxBufferHole: 0.5,            // Max gap allowed
  lowLatencyMode: false,         // Not needed for music
  startLevel: -1,                // Auto-select quality
};
```

### Transcoding Configuration

```typescript
// In scripts/transcode-to-hls.ts
const HLS_CONFIG = {
  SEGMENT_DURATION: 10,          // 10 second segments
  AUDIO_CODEC: 'aac',
  AUDIO_BITRATE: '256k',
  LARGE_FILE_THRESHOLD_MB: 20,   // Prioritize files > 20MB
};
```

## Troubleshooting

### Issue: HLS not loading

**Check:**
1. CORS headers on HLS bucket
2. Content-Type headers: `application/vnd.apple.mpegurl` for `.m3u8`
3. Track has been transcoded: Check `hls_path` column in database

### Issue: Still seeing iOS crashes

**Check:**
1. Engine type is `streaming`: `window.__playerDebug.getEngineType()`
2. HLS is active: `window.__playerDebug.getHLSMetrics()?.isHLSActive`
3. Buffer limits are being respected

### Issue: Slow initial playback

**Check:**
1. First segment size
2. CDN caching
3. Network quality: `window.__playerDebug.getMetrics().connectionQuality`

## Rollback

If issues occur, rollback to legacy engine:

```bash
# Environment variable
VITE_AUDIO_ENGINE_TYPE=legacy

# Or per-user via console
window.__playerDebug.switchEngine('legacy')
```

## Capacitor Native App

For best performance on mobile, wrap in Capacitor:

```bash
# Initialize Capacitor
npx cap init

# Add platforms
npx cap add ios
npx cap add android

# Build and sync
npm run build
npx cap sync

# Open native project
npx cap open ios
npx cap open android
```

See `ios-native-audio-plugin.md` for native plugin implementation.

## Performance Comparison

| Scenario | Legacy Engine | Streaming Engine |
|----------|--------------|------------------|
| NatureBeat (50MB) iOS | ❌ Crashes | ✅ Works |
| 3G Network | ⚠️ Stalls | ✅ Adaptive |
| Background Tab | ⚠️ Sometimes stops | ✅ Continues |
| Initial Load | ~2-3s | ~0.5-1s |
| Memory Usage | High (full file) | Low (segments) |

## Support

For issues with the new audio engine:

1. Export diagnostics: Click "Export" in Audio Diagnostics panel
2. Include: Engine type, platform, track ID, error messages
3. Check browser console for `[STREAMING ENGINE]` logs
