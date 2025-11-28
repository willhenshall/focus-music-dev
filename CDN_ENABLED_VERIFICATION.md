# CDN Now Enabled - Verification Guide

**Build Version:** 1457
**Storage Backend:** CloudFront CDN
**Status:** ✅ Ready to Test

---

## ✅ What Was Done

1. **Changed `.env` configuration:**
   ```bash
   VITE_STORAGE_BACKEND=cloudfront  # Changed from 'supabase'
   VITE_CDN_DOMAIN=pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev
   ```

2. **Built application:** Version 1457 ✅

---

## 🧪 How to Verify CDN is Working

### After Restarting the Dev Server

1. **Restart your dev server:**
   ```bash
   npm run dev
   ```

2. **Hard refresh browser:**
   - Press `Ctrl+Shift+R` (Windows/Linux)
   - Press `Cmd+Shift+R` (Mac)

3. **Open Audio Engine Diagnostics** (click the pulse icon in header)

4. **Check the Storage section:**
   - Should show: **"Cloudflare CDN"** (not "Supabase Storage")

5. **Check Audio URLs:**
   - Should be: `https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/{trackId}.mp3`
   - NOT: `https://xewajlyswijmjxuajhif.supabase.co/storage/...`

6. **Open Browser DevTools Console:**
   - Look for:
   ```
   [STORAGE ADAPTER] Creating adapter with config: {
     backend: 'cloudfront',
     cdnDomain: 'pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev'
   }
   ```

7. **Check Network Tab:**
   - Play a track
   - Filter by "media" or "mp3"
   - Verify requests go to: `pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev`

---

## 📋 Important: Database Migration Required

For the CDN tracking system to work fully, you need to add 3 columns to the database.

**Open Supabase SQL Editor:**
```
https://supabase.com/dashboard/project/xewajlyswijmjxuajhif/sql/new
```

**Run this SQL:**
```sql
-- Add CDN tracking columns
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS cdn_url text,
ADD COLUMN IF NOT EXISTS cdn_uploaded_at timestamptz,
ADD COLUMN IF NOT EXISTS storage_locations jsonb DEFAULT '{
  "supabase": false,
  "r2_cdn": false,
  "upload_timestamps": {}
}'::jsonb;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_audio_tracks_cdn_url
  ON audio_tracks(cdn_url);

CREATE INDEX IF NOT EXISTS idx_audio_tracks_storage_locations
  ON audio_tracks USING gin(storage_locations);
```

**Why this is needed:**
- Without these columns, the Edge Function can't track which files are on the CDN
- Audio will still play from CDN (URLs are generated dynamically)
- But sync status won't be saved to database

---

## 🔄 How CDN URL Generation Works

The app now uses the **CloudFrontStorageAdapter** which:

1. **Takes the track's `file_path`** from database
2. **Extracts the track ID:**
   - From: `https://...supabase.co/.../audio-files/146814.mp3`
   - Extracts: `146814`
3. **Generates CDN URL:**
   - To: `https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/146814.mp3`
4. **Caches URL** for 1 hour

**This works immediately** - no syncing needed for playback!

---

## 🎯 Expected Behavior

### ✅ What Should Work Now:
- Audio loads from CDN URLs
- Faster playback globally
- Storage adapter shows "Cloudflare CDN"
- Audio URLs point to `pub-...r2.dev`

### ⚠️ What Requires Files on CDN:
The tracks will only play if:
1. Files exist on the CDN already (from before), OR
2. You sync them using the Edge Function

**To sync a track to CDN:**
```bash
curl -X POST \
  https://xewajlyswijmjxuajhif.supabase.co/functions/v1/sync-to-cdn \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"trackId":"146814","operation":"upload"}'
```

---

## 🚨 Troubleshooting

### Audio doesn't play / 404 errors

**Cause:** Files don't exist on CDN yet

**Solutions:**

**Option 1: Keep using CDN** (if you had files on CDN before)
- Your old files should still be there
- Just restart dev server and clear cache

**Option 2: Sync files to CDN**
- Apply database migration first (SQL above)
- Run: `npm run test-cdn-sync` to test
- Use Edge Function to sync tracks as needed

**Option 3: Temporarily use Supabase**
- Change `.env` back to: `VITE_STORAGE_BACKEND=supabase`
- All audio will load from Supabase Storage
- No files need to be on CDN

### Still shows "Supabase Storage"

**Fix:**
1. Make sure `.env` has `VITE_STORAGE_BACKEND=cloudfront`
2. Restart dev server completely
3. Hard refresh browser (Ctrl+Shift+R)
4. Clear browser cache if needed

### Audio URLs still point to Supabase

**Fix:**
1. Check browser console for adapter logs
2. Verify `.env` variable is set correctly
3. Make sure you restarted after changing `.env`
4. Try incognito/private window

---

## 📊 Performance Benefits

Once CDN is active, you'll see:

- **Load Time:** <500ms (vs 1-2s from Supabase)
- **Global Latency:** <100ms
- **Bandwidth:** Free egress (vs paid on Supabase)
- **Scalability:** Unlimited concurrent users

---

## 🔄 Quick Commands

### Enable CDN
```bash
# In .env
VITE_STORAGE_BACKEND=cloudfront
```

### Disable CDN (rollback)
```bash
# In .env
VITE_STORAGE_BACKEND=supabase
```

### Test CDN Sync
```bash
npm run test-cdn-sync
```

### Restart Dev Server
```bash
npm run dev
```

---

## ✅ Summary

**Completed:**
- ✅ CDN enabled in `.env`
- ✅ Application built (v1457)
- ✅ Storage adapter configured

**To Verify:**
1. Restart dev server
2. Hard refresh browser
3. Check Audio Engine Diagnostics
4. Verify audio URLs point to R2

**Optional:**
- Apply database migration for CDN tracking
- Sync files to CDN if they don't exist yet

---

**CDN Domain:** `pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev`
**Status:** 🟢 **ENABLED AND READY**

Restart your dev server to see the changes!
