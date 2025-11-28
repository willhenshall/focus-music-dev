# ✅ Deployment Checklist

Print this out or keep it open while you deploy!

---

## Before You Start
- [ ] I have admin access to Supabase Dashboard
- [ ] I have access to Cloudflare R2 Dashboard
- [ ] I'm ready to test with a sample track

---

## Deployment Steps

### ⚡ Automatic Method
- [ ] Opened terminal/command prompt
- [ ] Navigated to project directory
- [ ] Ran deployment script
- [ ] Saw "Deployment Complete!" message
- [ ] Both functions deployed successfully

### 🖱️ Manual Method (if automatic didn't work)
- [ ] Logged into Supabase Dashboard
- [ ] Navigated to Edge Functions
- [ ] Found `sync-to-cdn` function
- [ ] Clicked Deploy button
- [ ] Saw success message
- [ ] Found `permanently-delete-tracks` function
- [ ] Clicked Deploy button
- [ ] Saw success message

---

## Testing Steps

### Upload & Delete Test
- [ ] Opened admin dashboard
- [ ] Clicked "Upload Track" in Music Library
- [ ] Uploaded a test audio file
- [ ] Noted the track ID: ________________
- [ ] Selected the track in library
- [ ] Clicked "Delete Selected"
- [ ] Chose "Permanently Delete" (not soft delete)
- [ ] Confirmed deletion

### Verify in CDN
- [ ] Opened Cloudflare Dashboard
- [ ] Navigated to R2 Storage
- [ ] Opened `focus-music-audio` bucket
- [ ] Went to `audio` folder
- [ ] Searched for my track ID
- [ ] **Confirmed file is DELETED** ✅

---

## Cleanup Old Files

### Remove 179095.mp3
- [ ] In Cloudflare R2 → `audio` folder
- [ ] Searched for "179095"
- [ ] Found `179095.mp3`
- [ ] Selected it (checkbox)
- [ ] Clicked Delete
- [ ] Confirmed deletion
- [ ] File is gone ✅

---

## Verification

### Check Function Logs (Optional but Recommended)
- [ ] In Supabase Dashboard → Edge Functions
- [ ] Clicked on `sync-to-cdn`
- [ ] Clicked "Logs" tab
- [ ] Looked for "Successfully attempted to delete audio file"
- [ ] Saw successful deletion logs ✅

---

## Final Checks
- [ ] Test track deleted from database ✅
- [ ] Test track deleted from Supabase storage ✅
- [ ] Test track deleted from Cloudflare CDN ✅
- [ ] Old orphan file (179095.mp3) cleaned up ✅
- [ ] Everything is working! 🎉

---

## If Something Failed

### Deployment Failed
- [ ] Checked error message
- [ ] Verified admin permissions
- [ ] Tried again
- [ ] Tried alternative deployment method
- [ ] Checked with help if still failing

### Test Failed (File Still in CDN)
- [ ] Waited 30 seconds
- [ ] Refreshed Cloudflare page
- [ ] Checked function logs for errors
- [ ] Verified I used "Permanently Delete" not "Soft Delete"
- [ ] Tried with a different track

---

## Success Criteria

✅ **All of these should be true:**
1. Both edge functions deployed without errors
2. Test track completely removed from all locations
3. Function logs show successful deletion messages
4. No more orphan files after deletion

---

## Notes & Observations

Write down anything unusual here:

**Deployment time:** ________________

**Any errors?** ________________

**Test track ID used:** ________________

**Everything working?** ⬜ Yes  ⬜ No

---

**Deployment Date:** ________________

**Deployed By:** ________________

**Build Version:** 1470

---

🎉 **Congratulations!** CDN deletion is now working properly!
