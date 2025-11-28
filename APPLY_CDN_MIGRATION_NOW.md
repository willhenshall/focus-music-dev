# Apply CDN Migration - Simple 2-Minute Process

## ✅ Good News: Edge Function Works!

Your Edge Function deployment was **successful**! It uploaded a file to CDN:
```
✅ https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/34173.mp3
```

## ⚠️ Next Step: Add Database Columns (2 minutes)

The database just needs 3 new columns to track CDN files.

---

## Quick Fix: Apply This SQL

**1. Open Supabase SQL Editor:**
```
https://supabase.com/dashboard/project/xewajlyswijmjxuajhif/sql/new
```

**2. Copy and paste this SQL:**

```sql
-- Add CDN tracking columns to audio_tracks table
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS cdn_url text,
ADD COLUMN IF NOT EXISTS cdn_uploaded_at timestamptz,
ADD COLUMN IF NOT EXISTS storage_locations jsonb DEFAULT '{
  "supabase": false,
  "r2_cdn": false,
  "upload_timestamps": {}
}'::jsonb;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_audio_tracks_cdn_url
  ON audio_tracks(cdn_url);

CREATE INDEX IF NOT EXISTS idx_audio_tracks_storage_locations
  ON audio_tracks USING gin(storage_locations);
```

**3. Click "Run" button**

**4. Verify it worked:**

```bash
npm run test-cdn-sync
```

You should see:
```
✅ CDN URL: https://pub-...r2.dev/audio/34173.mp3
✅ CDN Uploaded At: 2025-11-19T...
✅ Storage Locations: {...}
✅ CDN Sync test complete!
```

---

## Then Enable CDN!

After migration succeeds, enable CDN:

**Edit `.env`:**
```bash
VITE_STORAGE_BACKEND=cloudfront
```

**Restart:**
```bash
npm run dev
```

**Test audio playback** - should load from CDN! 🎉

---

## Summary

1. ✅ Edge Function deployed and working
2. ⏳ Apply SQL migration (2 min)
3. ✅ Test with `npm run test-cdn-sync`
4. ✅ Enable CDN in `.env`
5. ✅ Enjoy faster audio delivery!

**SQL Editor Link:**
https://supabase.com/dashboard/project/xewajlyswijmjxuajhif/sql/new
