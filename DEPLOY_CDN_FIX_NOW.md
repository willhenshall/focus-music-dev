# Deploy CDN Delete Fix - Simple Step-by-Step Guide

## What This Fix Does
When you hard delete a track in your app, it will now properly delete the audio file from Cloudflare's CDN. Previously, files like `179095.mp3` were left behind in the CDN.

---

## Deployment Steps

### Step 1: Open Your Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Log in with your account
3. Click on your **focus.music** project

---

### Step 2: Navigate to Edge Functions

1. Look at the left sidebar
2. Click on **"Edge Functions"** (it has a lightning bolt icon ⚡)
3. You'll see a list of functions

---

### Step 3: Deploy sync-to-cdn Function

1. **Find** the function named `sync-to-cdn` in the list
2. **Click** on it to open it
3. You'll see a code editor
4. **Click** the **"Deploy"** button (usually in the top right)
5. A popup will ask if you want to deploy - **Click "Deploy"** again to confirm
6. Wait for the green success message (usually takes 10-30 seconds)

---

### Step 4: Deploy permanently-delete-tracks Function

1. **Go back** to the Edge Functions list (click Edge Functions in the left sidebar again)
2. **Find** the function named `permanently-delete-tracks` in the list
3. **Click** on it to open it
4. **Click** the **"Deploy"** button
5. **Click "Deploy"** again to confirm
6. Wait for the green success message

---

### Step 5: Verify the Deployment

1. In your admin dashboard, go to **Music Library**
2. Upload a test track (any audio file)
3. Note the track ID (it will show in the library)
4. Delete the track (hard delete - not just soft delete)
5. Go to your Cloudflare R2 dashboard
6. Search for the track ID in the audio folder
7. **It should be deleted!** ✅

---

## If Deployment Button Doesn't Work

If you can't find a "Deploy" button or it's not working, follow these alternative steps:

### Alternative Method: Copy & Paste the Code

#### For sync-to-cdn:
1. Open Supabase Dashboard → Edge Functions → `sync-to-cdn`
2. Look for an **"Edit"** or **"Code"** button and click it
3. The code files are already updated in your project at:
   - `/supabase/functions/sync-to-cdn/index.ts`
4. If there's an option to "Pull from Git" or "Sync from Repository", use that
5. Otherwise, the file is already updated locally and will deploy when the system syncs

#### For permanently-delete-tracks:
1. Open Supabase Dashboard → Edge Functions → `permanently-delete-tracks`
2. Look for an **"Edit"** or **"Code"** button and click it
3. The code files are already updated in your project at:
   - `/supabase/functions/permanently-delete-tracks/index.ts`
4. If there's an option to "Pull from Git" or "Sync from Repository", use that

---

## What Changed (Technical Summary for Reference)

### File 1: sync-to-cdn
- **Location**: `/supabase/functions/sync-to-cdn/index.ts`
- **Change**: Now always attempts to delete from CDN using track_id as filename if cdn_url is missing
- **Lines Changed**: 156-217

### File 2: permanently-delete-tracks
- **Location**: `/supabase/functions/permanently-delete-tracks/index.ts`
- **Change**: Added track_id, cdn_url, and storage_locations to database query
- **Lines Changed**: 71-103

---

## Testing After Deployment

### Quick Test (Recommended)
1. Go to Admin Dashboard → Music Library
2. Click **"Upload Track"** button
3. Upload any small audio file (mp3, wav, etc.)
4. Wait for upload to complete
5. Note the track ID (example: 179200)
6. Select the track (checkbox on left)
7. Click **"Delete Selected"** button
8. Confirm **"Permanently Delete"** (not soft delete)
9. Go to Cloudflare R2 → focus-music-audio → audio folder
10. Search for your track ID (example: 179200.mp3)
11. **Result**: File should NOT be there ✅

### Check Existing Orphan File (179095.mp3)
1. Go to Cloudflare R2 → focus-music-audio → audio folder
2. Search for "179095"
3. You should see `179095.mp3` still there
4. You can manually delete it by:
   - Selecting the file (checkbox)
   - Clicking the Delete button
   - Confirming deletion

**Note**: The fix will prevent NEW orphan files, but won't automatically clean up existing ones. Those need manual cleanup.

---

## Troubleshooting

### Problem: "I don't see a Deploy button"
**Solution**: The functions might auto-deploy from your git repository. Wait 5 minutes and test anyway.

### Problem: "Deployment failed"
**Solution**:
1. Check the error message
2. Most common: Try deploying again (sometimes it's a temporary issue)
3. If it mentions "verification failed", make sure you're logged in as admin

### Problem: "File still appears in CDN after delete"
**Solution**:
1. Wait 30 seconds (CDN deletion isn't instant)
2. Refresh the Cloudflare R2 page
3. Check the Supabase Function Logs for error messages

### Problem: "How do I check if it's working?"
**Solution**:
1. Go to Supabase Dashboard
2. Click "Edge Functions" → "sync-to-cdn"
3. Click the "Logs" tab
4. Look for messages like "Successfully attempted to delete audio file"

---

## Need Help?

If deployment doesn't work:
1. Take a screenshot of any error message
2. Check the Supabase Function Logs for errors
3. Verify you have admin permissions in Supabase

---

**Status**: Ready to Deploy ✅
**Build Version**: 1469
**Date**: 2025-11-19
