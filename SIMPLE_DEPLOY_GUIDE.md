# 🚀 Super Simple Deployment Guide

## What You're Fixing
Files like `179095.mp3` weren't being deleted from Cloudflare CDN when you hard-deleted tracks. This fixes that.

---

## ⚡ Quick Deploy (Choose ONE method)

### 🎯 Method 1: Automatic Script (Easiest - Try This First!)

**Mac/Linux:**
```bash
./deploy-cdn-fix.sh
```

**Windows:**
```batch
deploy-cdn-fix.bat
```

Just double-click the file or run it in terminal. That's it! ✅

---

### 🖱️ Method 2: Manual via Dashboard (If script doesn't work)

#### Step 1: Go to Supabase
1. Open browser
2. Go to: https://supabase.com/dashboard
3. Click your **focus.music** project

#### Step 2: Open Edge Functions
1. Left sidebar → Click **"Edge Functions"** (⚡ icon)
2. You'll see a list of functions

#### Step 3: Deploy First Function
1. Click on **sync-to-cdn**
2. Look for a **Deploy** button (top right usually)
3. Click Deploy
4. Wait for green checkmark ✅

#### Step 4: Deploy Second Function
1. Go back to Edge Functions list
2. Click on **permanently-delete-tracks**
3. Click Deploy button
4. Wait for green checkmark ✅

**Done!** 🎉

---

## ✅ Test It Works

1. Go to your admin dashboard
2. Upload a test audio file
3. Note the track ID (example: `179200`)
4. Delete the track (hard delete)
5. Check Cloudflare R2 → `audio/179200.mp3`
6. **It should be gone!** ✅

---

## 🧹 Clean Up Old Orphan File

The file `179095.mp3` is still in your CDN. To remove it:

1. Go to Cloudflare Dashboard
2. Open R2 Storage
3. Click **focus-music-audio** bucket
4. Navigate to **audio** folder
5. Search for `179095`
6. Check the box next to `179095.mp3`
7. Click Delete button
8. Confirm deletion

---

## 🆘 If Something Goes Wrong

### "Script says Supabase CLI not installed"
**Fix:**
```bash
npm install -g supabase
```
Then run the script again.

### "Can't find Deploy button in dashboard"
The functions might auto-deploy. Wait 5 minutes and test it anyway.

### "Deployment failed"
1. Try clicking Deploy again
2. Check you're logged in as admin
3. If still failing, reach out for help

### "File still in CDN after delete"
1. Wait 30 seconds
2. Refresh the Cloudflare page
3. Try the test again with a new track

---

## 📋 What Got Changed (For Your Records)

**Files Updated:**
- `supabase/functions/sync-to-cdn/index.ts` - Now deletes using track_id as filename
- `supabase/functions/permanently-delete-tracks/index.ts` - Queries all needed fields

**What's Different:**
- Before: Only deleted if `cdn_url` field existed
- After: Always deletes using track_id (like `179095.mp3`)

---

## 📞 Quick Reference

| Thing | Location |
|-------|----------|
| Supabase Dashboard | https://supabase.com/dashboard |
| Edge Functions | Left sidebar with ⚡ icon |
| Function 1 | `sync-to-cdn` |
| Function 2 | `permanently-delete-tracks` |
| Test Location | Admin → Music Library |
| CDN Location | Cloudflare → R2 → focus-music-audio → audio/ |

---

**Build**: 1469 | **Status**: Ready ✅ | **Date**: Nov 19, 2025

---

## 🎬 That's It!

You're done. The CDN deletion should now work properly. Upload a track, delete it, and verify it's gone from the CDN.
