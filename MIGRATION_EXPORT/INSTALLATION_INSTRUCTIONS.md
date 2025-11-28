# Quick Installation Instructions

## 5-Minute Setup Guide

### Step 1: Copy Files (30 seconds)

```bash
# From the MIGRATION_EXPORT directory
cp -r lib/* /path/to/your-project/src/lib/
cp -r contexts/* /path/to/your-project/src/contexts/
```

### Step 2: Install Dependencies (1 minute)

```bash
cd /path/to/your-project
npm install @supabase/supabase-js
```

### Step 3: Configure Environment (1 minute)

Create or update `.env`:

```bash
# Required
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Choose storage backend
VITE_STORAGE_BACKEND=cloudfront  # or 'supabase', 's3', 'multi-cdn'
VITE_CDN_DOMAIN=media.focus.music
```

### Step 4: Update Supabase Types (2 minutes)

Add to `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export interface AudioChannel {
  id: string;
  channel_name: string;
  channel_number: number;
  display_order: number;
  playlist_data: Record<string, any>;
  playlist_strategy: Record<string, any>;
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
    duration?: number;
  };
  tempo: number | null;
  speed: number | null;
  intensity: number | null;
  arousal: number | null;
  valence: number | null;
  brightness: number | null;
  complexity: number | null;
  music_key_value: string | null;
  energy_low: boolean;
  energy_medium: boolean;
  energy_high: boolean;
  cdn_url: string | null;
  cdn_uploaded_at: string | null;
  storage_locations: Record<string, any> | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
}
```

### Step 5: Wrap Your App (30 seconds)

In `src/main.tsx` or `src/App.tsx`:

```typescript
import { MusicPlayerProvider } from './contexts/MusicPlayerContext';

function App() {
  return (
    <MusicPlayerProvider>
      {/* Your app components */}
    </MusicPlayerProvider>
  );
}

export default App;
```

### Step 6: Use in Components (1 minute)

```typescript
import { useMusicPlayer } from '../contexts/MusicPlayerContext';

function PlayerComponent() {
  const {
    channels,
    activeChannel,
    isPlaying,
    currentTrack,
    toggleChannel,
    skipTrack
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
        <p>Now Playing: {currentTrack.metadata.track_name}</p>
      )}
      <button onClick={skipTrack}>Skip</button>
    </div>
  );
}
```

### Step 7: Test (1 minute)

```bash
npm run dev
```

Navigate to your app and click Play!

---

## Next Steps

- Read `AUDIO_ENGINE_MIGRATION_GUIDE.md` for complete documentation
- Review database schema requirements
- Configure your CDN
- Set up analytics tracking
- Monitor audio metrics

## Common Configurations

### Development (Supabase Storage)
```bash
VITE_STORAGE_BACKEND=supabase
```

### Production (Cloudflare CDN)
```bash
VITE_STORAGE_BACKEND=cloudfront
VITE_CDN_DOMAIN=media.yourdomain.com
```

### High Availability
```bash
VITE_STORAGE_BACKEND=multi-cdn
VITE_CDN_DOMAIN=media.yourdomain.com
```

---

**Total Setup Time: ~5 minutes**
**Ready for Production: ✅**
