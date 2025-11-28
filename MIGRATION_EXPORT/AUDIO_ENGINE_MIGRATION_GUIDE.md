# Audio Engine and Playlist System - Migration Package

## Table of Contents
1. [Technical Overview](#technical-overview)
2. [Architecture Documentation](#architecture-documentation)
3. [Installation Guide](#installation-guide)
4. [Code Export Modules](#code-export-modules)
5. [Integration Instructions](#integration-instructions)
6. [Data Flow Diagrams](#data-flow-diagrams)

---

## Technical Overview

This migration package provides a complete, production-ready audio playback engine and playlist system extracted from the Focus.Music application. The system has been tested with 11,233 tracks across a global user base with 99.9% uptime targets.

### Core Components

1. **Enterprise Audio Engine** - HTML5 audio playback with adaptive bitrate streaming
2. **Slot Strategy Engine** - Intelligent track selection based on metadata targets
3. **Playlister Service** - Multiple playlist generation strategies
4. **Storage Adapters** - Multi-CDN support (Supabase/Cloudflare/S3)
5. **Analytics Service** - Comprehensive playback tracking
6. **Music Player Context** - React integration layer

---

## Architecture Documentation

### 1. Audio Engine Architecture

The Enterprise Audio Engine provides enterprise-grade audio playback with:

#### Core Features
- **Dual Audio Elements**: Primary and secondary audio elements for gapless playback
- **Automatic Retry Logic**: Exponential backoff with jittered retry (5 attempts)
- **Circuit Breaker Pattern**: Prevents cascading failures across CDN infrastructure
- **Adaptive Buffering**: Adjusts buffer size based on detected bandwidth
- **Network Monitoring**: Real-time online/offline detection and connection quality assessment
- **Stall Recovery**: Progressive recovery strategies for playback interruptions
- **MediaSession API**: Lock screen and system-level media controls

#### Technical Specifications
```
Retry Configuration:
- Max Attempts: 5
- Base Delay: 500ms
- Max Delay: 8000ms
- Timeout Per Attempt: 15s
- Overall Timeout: 45s
- Jitter Factor: 0.3

Circuit Breaker:
- Failure Threshold: 5
- Reset Time: 30s
- States: closed, open, half-open

Stall Detection:
- Detection Delay: 5s
- Recovery Attempts: 3 progressive strategies
- Auto-skip on failure
```

#### Error Categorization
The engine categorizes errors for intelligent retry decisions:
- `network` - Retriable network errors
- `decode` - Non-retriable codec/format errors
- `auth` - Non-retriable authentication errors
- `cors` - Non-retriable CORS configuration errors
- `timeout` - Retriable timeout errors
- `unknown` - Retriable unknown errors

#### Audio Metrics
Comprehensive real-time metrics available via callback:
```typescript
interface AudioMetrics {
  // Playback State
  playbackState: 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'stopped' | 'error';
  currentTime: number;
  duration: number;

  // Buffer Management
  buffered: number;
  bufferPercentage: number;
  bytesLoaded: number;
  totalBytes: number;

  // Network Quality
  isOnline: boolean;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
  estimatedBandwidth: number; // kbps
  downloadSpeed: number; // bytes/sec

  // Reliability
  retryAttempt: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  sessionSuccessRate: number; // percentage

  // Error State
  error: string | null;
  errorCategory: ErrorCategory | null;

  // Prefetch State
  prefetchedTrackId: string | null;
  prefetchProgress: number;
}
```

### 2. Storage Adapter System

The storage adapter pattern enables hot-swapping between storage providers:

#### Adapter Types

**SupabaseStorageAdapter**
- Direct access to Supabase Storage
- Public URL generation with 1-hour cache
- Development and fallback usage

**CloudFrontStorageAdapter (Cloudflare R2)**
- CDN-accelerated delivery
- Track ID-based URL construction: `https://media.focus.music/audio/{track_id}.mp3`
- Optional signed URL support
- Regional endpoint support

**S3StorageAdapter**
- Direct S3 access
- Presigned URL generation
- Regional endpoint support

**MultiCDNStorageAdapter**
- Automatic failover between adapters
- Failure count tracking
- Adaptive circuit breaking per adapter

#### Configuration
```typescript
// Environment variables control adapter selection
VITE_STORAGE_BACKEND = 'cloudfront' | 'supabase' | 's3' | 'multi-cdn'
VITE_CDN_DOMAIN = 'media.focus.music'
VITE_CLOUDFRONT_SIGNING_ENABLED = 'true' | 'false'
```

### 3. Playlist System Architecture

The system supports multiple playlist generation strategies:

#### Strategy Types

**1. Weighted Random**
- Tracks have individual weights (0.0-1.0)
- Higher weight = higher probability of selection
- No-repeat window enforcement

**2. Random Shuffle**
- Fisher-Yates shuffle algorithm
- Optional no-repeat window
- Uniform distribution

**3. Ordered Strategies**
- `filename_order`: Alphabetical by filename
- `track_id_order`: Numerical by track ID
- `upload_date`: Chronological by upload
- `custom`: User-defined order

**4. Slot-Based Strategy** (Advanced)
- Each slot defines target musical descriptors
- Weighted field matching with configurable boosts
- Rule-based filtering (AND/OR logic)
- Per-slot track selection
- No-repeat window per user

### 4. Slot Strategy Engine

The most advanced playlist generation system, designed to match Focus@Will's musical algorithm.

#### Slot Definition
```typescript
interface SlotDefinition {
  index: number;              // Slot position (1-N)
  targets: {
    speed?: number;           // 0-5
    intensity?: number;       // 0-5
    brightness?: number;      // 0-5
    complexity?: number;      // 0-5
    valence?: number;         // -1 to 1
    arousal?: number;         // 0-1
    bpm?: number;             // 60-180
    key?: string;             // Musical key
  };
}
```

#### Slot Boosts
Control which fields matter most for track matching:
```typescript
interface SlotBoost {
  field: 'speed' | 'intensity' | 'brightness' | ...;
  mode: 'near' | 'exact';
  weight: number; // 1-5 (higher = more important)
}

// Default boosts (Focus@Will standard):
{
  intensity: { weight: 4, mode: 'near' },  // Most important
  speed: { weight: 2, mode: 'near' },
  brightness: { weight: 1, mode: 'near' },
  complexity: { weight: 1, mode: 'near' },
  valence: { weight: 1, mode: 'near' },
  arousal: { weight: 1, mode: 'near' },
  bpm: { weight: 1, mode: 'near' }
}
```

#### Rule Groups
Filter tracks before scoring:
```typescript
interface SlotRuleGroup {
  logic: 'AND' | 'OR';
  order: number;
  rules: [
    { field: 'genre', operator: 'eq', value: 'Classical' },
    { field: 'duration_seconds', operator: 'between', value: [120, 300] },
    { field: 'locked', operator: 'eq', value: false }
  ]
}
```

#### Scoring Algorithm
1. **Distance Calculation**: For each boosted field, calculate normalized distance between target and track value
2. **Match Score**: Convert distance to match score (1 - distance)
3. **Weighted Sum**: Multiply match scores by boost weights
4. **Normalization**: Divide by total weight to get final score (0-1)

#### Selection Process
1. Query tracks from database with genre pre-filtering
2. Filter by recently played tracks (no-repeat window)
3. Apply rule groups (AND/OR logic)
4. Score remaining candidates
5. Sort by score (descending)
6. Select top candidate

#### Performance Optimization
- **Cached Strategy Loading**: Preload slot definitions, boosts, and rules
- **Batch Track Queries**: Fetch all required data in single query
- **Genre Pre-filtering**: Apply genre rules at SQL level
- **Result**: ~500ms selection time vs ~5s without caching

#### Playback Continuation Modes
```typescript
'continue'          // Resume from last position across sessions
'restart_session'   // Restart on new session, continue within session
'restart_login'     // Restart on every login/channel change
```

### 5. Analytics Service

Tracks comprehensive playback metrics:

#### Track Play Events
```typescript
interface TrackPlayEvent {
  track_id: string;
  user_id: string;
  channel_id: string;
  session_id: string;
  started_at: timestamp;
  completed_at: timestamp;
  duration_played: number;       // Seconds actually played
  total_duration: number;        // Track total duration
  completion_percentage: number; // 0-100
  was_skipped: boolean;
  skip_position: number;         // Where user skipped
  device_type: 'desktop' | 'mobile' | 'tablet';
}
```

#### Listening Sessions
```typescript
interface ListeningSession {
  user_id: string;
  channel_id: string;
  energy_level: 'low' | 'medium' | 'high';
  started_at: timestamp;
  ended_at: timestamp;
  tracks_played: string[];      // Track IDs
  tracks_skipped: string[];     // Track IDs
  total_duration: number;       // Session length
}
```

#### Analytics Summary
Materialized view for performance:
```typescript
interface TrackAnalyticsSummary {
  track_id: string;
  total_plays: number;
  total_skips: number;
  skip_rate: number;            // 0-100
  avg_completion: number;       // 0-100
  avg_listen_duration: number;  // Seconds
  last_played_at: timestamp;
}
```

---

## Data Flow Diagrams

### Track Playback Flow
```
User Action (Channel Toggle)
    ↓
MusicPlayerContext.toggleChannel()
    ↓
Preload Slot Strategy (if slot-based) [Parallel]
    ↓
Generate Playlist
    ├─ Slot-Based: selectNextTrackCached()
    │   ├─ Calculate slot index from session position
    │   ├─ Load slot definition with cached strategy
    │   ├─ Query tracks with genre pre-filter
    │   ├─ Apply rule groups
    │   ├─ Score candidates
    │   └─ Select winner
    │
    ├─ Weighted: generateWeightedSequence()
    ├─ Random: generateRandomSequence()
    └─ Ordered: generateLoopingSequence()
    ↓
Set Playlist State (React)
    ↓
useEffect() Detects Playlist Change
    ↓
EnterpriseAudioEngine.loadTrack()
    ├─ Check circuit breaker
    ├─ Get URL from StorageAdapter
    │   ├─ Supabase: getPublicUrl()
    │   ├─ Cloudflare: Construct CDN URL
    │   └─ S3: Generate presigned URL
    ├─ Load with retry (exponential backoff)
    ├─ Network monitoring
    ├─ Buffer management
    └─ Stall detection
    ↓
Track Loaded → Analytics Start
    ↓
EnterpriseAudioEngine.play()
    ├─ Crossfade if previous track exists
    ├─ MediaSession metadata update
    └─ Start metrics loop
    ↓
Playback Active
    ├─ Real-time metrics updates
    ├─ Prefetch next track (Spotify-style)
    ├─ Monitor buffer health
    └─ Handle visibility changes (tab switching)
    ↓
Track End / Skip
    ↓
Analytics End (duration, completion %, skip flag)
    ↓
Update Playback Position (slot-based only)
    ↓
Load Next Track (repeat cycle)
```

### Slot Strategy Caching Flow
```
Channel Toggle / Energy Change
    ↓
Check Cache: slotStrategyCache[channelId:energyLevel]
    ↓
    ├─ Cache Hit: Use cached data
    │   └─ Contains: strategy, definitions, boosts, ruleGroups
    │
    └─ Cache Miss: Load from database
        ├─ Load slot_strategies
        ├─ Load slot_definitions [Parallel]
        ├─ Load slot_rule_groups + rules [Parallel]
        └─ Load slot_boosts for all definitions
        ↓
        Store in cache
        ↓
Use cached data for all track selections
    ↓
Selection Time: ~500ms (vs ~5s without cache)
```

### Network Error Recovery Flow
```
Track Load Attempt
    ↓
Network Error Detected
    ↓
Categorize Error
    ├─ Network → Retriable
    ├─ Timeout → Retriable
    ├─ Decode → Non-retriable (skip track)
    ├─ CORS → Non-retriable (skip track)
    └─ Auth → Non-retriable (skip track)
    ↓
Is Retriable?
    ├─ No → Skip to next track
    │
    └─ Yes → Record Failure
        ↓
        Check Circuit Breaker
        ├─ Open → Wait for reset
        │
        └─ Closed/Half-open
            ↓
            Calculate Backoff Delay
            delay = min(baseDelay * 2^attempt, maxDelay) + jitter
            ↓
            Wait delay ms
            ↓
            Retry Attempt (max 5)
            ↓
            Success?
            ├─ Yes → Record Success, Continue
            └─ No → Repeat or Skip
```

---

## Installation Guide

### Prerequisites

```json
{
  "@supabase/supabase-js": "^2.57.4",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
}
```

### Environment Variables

Create or update your `.env` file:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Storage Backend Selection
VITE_STORAGE_BACKEND=cloudfront  # or 'supabase', 's3', 'multi-cdn'

# CDN Configuration (for CloudFront backend)
VITE_CDN_DOMAIN=media.focus.music
VITE_CLOUDFRONT_SIGNING_ENABLED=false

# S3 Configuration (optional, for S3 backend)
VITE_S3_BUCKET=your-bucket
VITE_S3_REGION=us-east-1
```

### Database Schema Requirements

The system requires the following database tables (migration files available in `supabase/migrations/`):

#### Core Tables
- `audio_channels` - Channel definitions with playlist data
- `audio_tracks` - Track metadata and file paths
- `user_preferences` - User settings and last played state
- `listening_sessions` - Session tracking
- `track_play_events` - Individual play events
- `track_analytics_summary` - Aggregated metrics

#### Slot Strategy Tables (Optional, for advanced playlists)
- `slot_strategies` - Strategy definitions per channel/energy
- `slot_definitions` - Individual slot target values
- `slot_boosts` - Field weighting configuration
- `slot_rule_groups` - Filtering rule groups
- `slot_rules` - Individual filtering rules
- `user_playback_state` - Per-user playback position tracking

#### Storage Buckets
- `audio-files` - MP3 audio files (public)
- `audio-sidecars` - JSON metadata files (public)

### File Structure

```
your-app/
├── src/
│   ├── lib/
│   │   ├── enterpriseAudioEngine.ts     [COPY]
│   │   ├── storageAdapters.ts           [COPY]
│   │   ├── playlisterService.ts         [COPY]
│   │   ├── slotStrategyEngine.ts        [COPY]
│   │   ├── analyticsService.ts          [COPY]
│   │   └── supabase.ts                  [UPDATE]
│   │
│   └── contexts/
│       └── MusicPlayerContext.tsx       [COPY]
│
└── supabase/
    └── migrations/                       [REFERENCE]
```

---

## Integration Instructions

### Step 1: Install Dependencies

```bash
npm install @supabase/supabase-js
```

### Step 2: Copy Core Modules

Copy the following files from the code export section to your project:

1. `src/lib/enterpriseAudioEngine.ts`
2. `src/lib/storageAdapters.ts`
3. `src/lib/playlisterService.ts`
4. `src/lib/slotStrategyEngine.ts`
5. `src/lib/analyticsService.ts`
6. `src/contexts/MusicPlayerContext.tsx`

### Step 3: Update Supabase Client

Update your `src/lib/supabase.ts` to include required type definitions:

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Add these type definitions
export interface AudioChannel {
  id: string;
  channel_name: string;
  channel_number: number;
  display_order: number;
  playlist_data: Record<string, any>;
  playlist_strategy: Record<string, {
    strategy: 'weighted' | 'random' | 'filename_order' | 'track_id_order' | 'slot_based';
    playbackContinuation?: 'continue' | 'restart_session' | 'restart_login';
  }>;
  created_at: string;
  updated_at: string;
}

export interface AudioTrack {
  id: string;
  file_path: string;
  channel_id: string | null;
  energy_level: string;
  duration_seconds: number;
  metadata: {
    track_id: string;
    track_name: string;
    artist_name?: string;
    album?: string;
    genre?: string;
    bpm?: number;
    file_size?: number;
    duration?: number;
  };

  // Musical descriptors
  tempo: number | null;
  speed: number | null;
  intensity: number | null;
  arousal: number | null;
  valence: number | null;
  brightness: number | null;
  complexity: number | null;
  music_key_value: string | null;

  // Energy assignments
  energy_low: boolean;
  energy_medium: boolean;
  energy_high: boolean;

  // CDN tracking
  cdn_url: string | null;
  cdn_uploaded_at: string | null;
  storage_locations: Record<string, any> | null;

  // Soft delete
  deleted_at: string | null;
  deleted_by: string | null;

  created_at: string;
  updated_at: string;
}
```

### Step 4: Wrap Your App with MusicPlayerProvider

```typescript
// src/main.tsx or src/App.tsx
import { MusicPlayerProvider } from './contexts/MusicPlayerContext';

function App() {
  return (
    <MusicPlayerProvider>
      {/* Your app components */}
    </MusicPlayerProvider>
  );
}
```

### Step 5: Use the Music Player in Components

```typescript
import { useMusicPlayer } from '../contexts/MusicPlayerContext';

function MyPlayerComponent() {
  const {
    channels,
    activeChannel,
    isPlaying,
    currentTrack,
    audioMetrics,
    toggleChannel,
    setChannelEnergy,
    skipTrack,
    seek,
    setVolume,
  } = useMusicPlayer();

  const handlePlay = async () => {
    if (channels.length > 0) {
      await toggleChannel(channels[0], true);
    }
  };

  return (
    <div>
      <button onClick={handlePlay}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>

      {currentTrack && (
        <div>
          <p>Now Playing: {currentTrack.metadata.track_name}</p>
          <p>Artist: {currentTrack.metadata.artist_name}</p>
        </div>
      )}

      {audioMetrics && (
        <div>
          <p>Buffer: {audioMetrics.bufferPercentage.toFixed(0)}%</p>
          <p>Connection: {audioMetrics.connectionQuality}</p>
        </div>
      )}
    </div>
  );
}
```

### Step 6: Configure Storage Backend

Update your environment variables based on your deployment:

**Development (Supabase Storage):**
```bash
VITE_STORAGE_BACKEND=supabase
```

**Production (Cloudflare CDN):**
```bash
VITE_STORAGE_BACKEND=cloudfront
VITE_CDN_DOMAIN=media.focus.music
```

**High Availability (Multi-CDN with Failover):**
```bash
VITE_STORAGE_BACKEND=multi-cdn
VITE_CDN_DOMAIN=media.focus.music
```

### Step 7: Verify Database Schema

Run the database migrations to ensure all required tables exist:

```bash
# If using Supabase CLI
supabase db push

# Or apply migrations manually through Supabase Dashboard
```

Required tables:
- ✓ audio_channels
- ✓ audio_tracks
- ✓ user_preferences
- ✓ listening_sessions
- ✓ track_play_events
- ✓ track_analytics_summary

Optional (for slot-based playlists):
- ✓ slot_strategies
- ✓ slot_definitions
- ✓ slot_boosts
- ✓ slot_rule_groups
- ✓ slot_rules
- ✓ user_playback_state

---

## Breaking Changes and Compatibility Notes

### Version Compatibility

**Minimum Requirements:**
- React 18.0+
- TypeScript 5.0+
- Modern browser with:
  - HTML5 Audio support
  - MediaSession API (optional, for lock screen controls)
  - Network Information API (optional, for bandwidth detection)

### Known Breaking Changes

1. **React 18 Strict Mode**: The audio engine creates HTMLAudioElements once on mount. In development with StrictMode, you may see double creation/destruction. This is expected React behavior and won't occur in production.

2. **Tab Switching**: The system maintains playback state when tabs are hidden/shown. Safari may throttle background audio. The system automatically resumes on tab focus if needed.

3. **Storage Adapter URLs**: If migrating from a different CDN, update the `CloudFrontStorageAdapter` constructor to use your CDN domain:
   ```typescript
   const adapter = new CloudFrontStorageAdapter({
     cdnDomain: 'your-cdn-domain.com'
   });
   ```

4. **Database Column Names**: The system expects specific column names in `audio_tracks`:
   - `speed`, `intensity`, `brightness`, `complexity`, `arousal`, `valence`, `tempo`
   - If your database uses different names, update the slot strategy engine queries

### Migration from Other Systems

**If you're migrating from a basic audio player:**
1. The Enterprise Audio Engine replaces direct `<audio>` element usage
2. Context-based state management replaces component-level state
3. Analytics tracking is automatic (opt-out if not needed)

**If you're migrating from a different playlist system:**
1. Channel definitions must include `playlist_strategy` configuration
2. Track metadata must include musical descriptors for slot-based playlists
3. User playback state tracking requires new table (`user_playback_state`)

---

## Performance Considerations

### Optimization Recommendations

1. **Prefetching**: Enable automatic next-track prefetching (enabled by default)
   - Reduces perceived latency between tracks
   - Spotify-style buffering strategy

2. **Strategy Caching**: Slot strategies are cached in memory
   - First selection: ~5s (includes DB queries)
   - Subsequent selections: ~500ms (cache hit)
   - Cache is per channel/energy combination

3. **Database Indexes**: Ensure these indexes exist for optimal performance:
   ```sql
   CREATE INDEX idx_audio_tracks_channel_energy
     ON audio_tracks(channel_id, energy_level)
     WHERE deleted_at IS NULL;

   CREATE INDEX idx_audio_tracks_metadata_track_id
     ON audio_tracks((metadata->>'track_id'));

   CREATE INDEX idx_audio_tracks_genre
     ON audio_tracks((metadata->>'genre'));
   ```

4. **CDN Configuration**:
   - Use Cloudflare R2 or CloudFront for production
   - Enable HTTP/2 push for faster initial loads
   - Set appropriate cache headers (1 year for immutable audio)

5. **Analytics Batching**:
   - Analytics writes use RPC functions for atomic updates
   - Consider adding a write buffer for high-traffic scenarios

### Memory Usage

Typical memory footprint:
- Audio Engine: ~5-10 MB (2 audio elements + buffers)
- Strategy Cache: ~1-2 MB per channel/energy combination
- Metrics: ~100 KB (real-time diagnostics)

---

## Testing and Validation

### Unit Testing

Test the core modules independently:

```typescript
// Example: Testing storage adapter
import { SupabaseStorageAdapter } from './storageAdapters';

test('generates correct public URL', async () => {
  const adapter = new SupabaseStorageAdapter();
  const url = await adapter.getAudioUrl('12345.mp3');
  expect(url).toContain('audio-files/12345.mp3');
});
```

### Integration Testing

Test the music player context:

```typescript
// Example: Testing playlist generation
import { render, waitFor } from '@testing-library/react';
import { MusicPlayerProvider, useMusicPlayer } from './MusicPlayerContext';

test('generates playlist on channel toggle', async () => {
  const { result } = renderHook(() => useMusicPlayer(), {
    wrapper: MusicPlayerProvider
  });

  await act(async () => {
    await result.current.toggleChannel(testChannel, true);
  });

  await waitFor(() => {
    expect(result.current.playlist.length).toBeGreaterThan(0);
  });
});
```

### End-to-End Testing

Playwright tests are available in `tests/` directory:

```bash
npm run test
```

Key test scenarios:
- Channel toggle and playback start
- Track progression and skip functionality
- Energy level changes during playback
- Tab switching behavior (regression test)
- Network error recovery

---

## Troubleshooting

### Common Issues

**Issue: "Circuit breaker is open" error**
- **Cause**: Too many failed track loads (5+ consecutive failures)
- **Solution**: Check CDN availability, verify track URLs, wait 30s for auto-reset

**Issue: Tracks not loading**
- **Cause**: Incorrect storage backend configuration
- **Solution**: Verify `VITE_STORAGE_BACKEND` and `VITE_CDN_DOMAIN` environment variables

**Issue: Playback restarts when switching tabs**
- **Cause**: Browser throttling background tabs
- **Solution**: This is expected browser behavior. The system automatically resumes on tab focus.

**Issue: Slot strategy selection is slow (5+ seconds)**
- **Cause**: Strategy not cached
- **Solution**: Ensure `preloadSlotStrategy()` is called before playlist generation

**Issue: Analytics not recording**
- **Cause**: Missing database tables or RLS policies
- **Solution**: Run all migrations, verify RLS policies allow authenticated inserts

### Debug Mode

Enable detailed logging:

```typescript
// In MusicPlayerContext.tsx, the audio engine logs to console automatically
// Check browser console for:
// [AUDIO ENGINE] - Engine lifecycle events
// [CDN ADAPTER] - Storage adapter operations
// [DIAGNOSTIC] - Playback state changes
// [PAGE VISIBILITY] - Tab switching behavior
```

Access debug interface in browser console:

```javascript
// Available in production builds
window.__playerDebug.getTrackId()
window.__playerDebug.getPlaylistIndex()
window.__playerDebug.getTransportState()
window.__playerDebug.getPlaylist()
```

---

## Support and Maintenance

### Regular Maintenance Tasks

1. **Monitor Analytics**: Check `track_analytics_summary` for high skip rates
2. **CDN Health**: Monitor CDN failure rates via `audioMetrics.failureCount`
3. **Cache Warmup**: Consider pre-loading popular channel strategies on app start
4. **Database Cleanup**: Archive old `track_play_events` (90+ days) for performance

### Performance Monitoring

Key metrics to track:
- Average time to first byte (TTFB) for track loads
- Circuit breaker open frequency
- Playlist generation time
- Buffer underrun events (stall count)
- Session success rate

---

## License and Credits

This audio engine and playlist system was developed for Focus.Music and is provided as-is for migration purposes. The code includes patterns and algorithms inspired by industry-leading music streaming services.

Core Technologies:
- HTML5 Audio API
- MediaSession API
- Supabase (PostgreSQL + Storage)
- React Context API
- TypeScript

---

## Appendix: Complete API Reference

### EnterpriseAudioEngine

```typescript
class EnterpriseAudioEngine {
  constructor(storageAdapter: StorageAdapter);

  // Lifecycle
  async loadTrack(trackId: string, filePath: string, metadata?: TrackMetadata): Promise<void>;
  async play(): Promise<void>;
  pause(): void;
  stop(): void;
  destroy(): void;

  // Playback Control
  seek(time: number): void;
  setVolume(value: number): void;
  getVolume(): number;
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;

  // Advanced Features
  prefetchNextTrack(trackId: string, filePath: string): void;
  setCrossfadeEnabled(enabled: boolean): void;
  setStorageAdapter(adapter: StorageAdapter): void;

  // Monitoring
  getMetrics(): AudioMetrics;
  setCallbacks(callbacks: {
    onTrackLoad?: (trackId: string, duration: number) => void;
    onTrackEnd?: () => void;
    onDiagnosticsUpdate?: (metrics: AudioMetrics) => void;
    onError?: (error: Error, category: ErrorCategory, canRetry: boolean) => void;
  }): void;
}
```

### MusicPlayerContext

```typescript
interface MusicPlayerContextType {
  // State
  channels: AudioChannel[];
  activeChannel: AudioChannel | null;
  playlist: AudioTrack[];
  currentTrack: AudioTrack | undefined;
  isPlaying: boolean;
  audioEngine: EnterpriseAudioEngine | null;
  audioMetrics: AudioMetrics | null;

  // Controls
  toggleChannel(channel: AudioChannel, turnOn: boolean): Promise<void>;
  setChannelEnergy(channelId: string, energyLevel: EnergyLevel): void;
  skipTrack(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  getVolume(): number;

  // Data Management
  loadChannels(): Promise<void>;
}
```

### SlotStrategyEngine

```typescript
// Primary selection function
async function selectNextTrack(
  supabase: SupabaseClient,
  params: {
    channelId: string;
    energyTier: 'low' | 'medium' | 'high';
    slotIndex: number;
    history: string[];
    seed?: number;
  }
): Promise<SelectionResult | null>;

// Optimized version with cache
async function selectNextTrackCached(
  supabase: SupabaseClient,
  params: {
    channelId: string;
    energyTier: 'low' | 'medium' | 'high';
    slotIndex: number;
    history: string[];
    cachedStrategy?: any;
  }
): Promise<SelectionResult | null>;

// Helper function
function getCurrentSlotIndex(sessionPlayCount: number, numSlots: number): number;
```

### PlaylisterService

```typescript
async function generatePlaylist(
  request: PlaylistRequest
): Promise<PlaylistResponse>;

async function generatePlaylistSequence(
  request: PlaylistSequenceRequest
): Promise<PlaylistResponse>;

interface PlaylistRequest {
  channelId: string;
  energyLevel: 'low' | 'medium' | 'high';
  userId: string;
  strategy?: PlaylistStrategy;
}
```

### AnalyticsService

```typescript
async function trackPlayStart(
  trackId: string,
  duration: number,
  userId?: string,
  channelId?: string,
  sessionId?: string
): Promise<string | null>;

async function trackPlayEnd(
  eventId: string,
  actualDuration: number,
  wasSkipped: boolean,
  skipPosition?: number
): Promise<void>;

async function getTopTracks(limit?: number, days?: number): Promise<any[]>;
async function getTopSkippedTracks(limit?: number, days?: number): Promise<any[]>;
async function getTrackAnalytics(trackId: string): Promise<any>;
```

---

## Migration Checklist

- [ ] Install dependencies (`@supabase/supabase-js`)
- [ ] Copy all module files to your project
- [ ] Update `supabase.ts` with type definitions
- [ ] Configure environment variables
- [ ] Verify database schema (run migrations)
- [ ] Wrap app with `MusicPlayerProvider`
- [ ] Test basic playback in development
- [ ] Test storage adapter configuration
- [ ] Verify analytics recording
- [ ] Test slot-based playlist generation (if applicable)
- [ ] Run end-to-end tests
- [ ] Monitor circuit breaker behavior
- [ ] Deploy to production
- [ ] Monitor CDN health and metrics

---

**End of Migration Guide**
