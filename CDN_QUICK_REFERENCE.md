# CDN Quick Reference Card

**One-Page Reference for Cloudflare CDN Operations**

---

## 🚀 Quick Deployment (3 Steps)

```bash
# 1. Deploy Edge Function
npx supabase functions deploy sync-to-cdn

# 2. Enable CDN in .env
echo "VITE_STORAGE_BACKEND=cloudfront" >> .env

# 3. Restart & Test
npm run dev
```

---

## 🔧 Configuration

### Environment Variables (.env)
```bash
VITE_STORAGE_BACKEND=cloudfront  # or 'supabase' for rollback
VITE_CDN_DOMAIN=pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev
```

### R2 Configuration (Hardcoded in Edge Function)
```
Account ID:  531f033f1f3eb591e89baff98f027cee
Bucket:      focus-music-audio
Public URL:  https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev
Audio Path:  /audio/{trackId}.mp3
Metadata:    /metadata/{trackId}.json
```

---

## 🧪 Testing

### Test Edge Function
```bash
npm run test-cdn-sync
```

### Test Manual Sync
```bash
curl -X POST \
  https://xewajlyswijmjxuajhif.supabase.co/functions/v1/sync-to-cdn \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"trackId":"179117","operation":"upload"}'
```

### Verify CDN URL in Browser
```
Open DevTools Console → Look for:
[CDN ADAPTER] Generated CDN URL: https://pub-...r2.dev/audio/[ID].mp3
```

---

## 📊 Monitoring

### Check Sync Status
```sql
SELECT
  COUNT(*) FILTER (WHERE cdn_url IS NOT NULL) as synced,
  COUNT(*) as total
FROM audio_tracks
WHERE deleted_at IS NULL;
```

### View Edge Function Logs
```bash
npx supabase functions logs sync-to-cdn --limit 20
```

### Recent CDN Uploads
```sql
SELECT track_id, track_name, cdn_url, cdn_uploaded_at
FROM audio_tracks
WHERE cdn_url IS NOT NULL
ORDER BY cdn_uploaded_at DESC
LIMIT 10;
```

---

## 🔄 Operations

### Sync Single Track
```typescript
await fetch(`${SUPABASE_URL}/functions/v1/sync-to-cdn`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    trackId: '179117',
    operation: 'upload'
  })
});
```

### Delete from CDN
```typescript
await fetch(`${SUPABASE_URL}/functions/v1/sync-to-cdn`, {
  method: 'POST',
  body: JSON.stringify({
    trackId: '179117',
    operation: 'delete'
  })
});
```

---

## 🚨 Troubleshooting

### CDN Not Working

**Check:**
```bash
# 1. Storage backend setting
grep VITE_STORAGE_BACKEND .env

# 2. Edge Function deployed
npx supabase functions list | grep sync-to-cdn

# 3. Browser console for logs
# Look for [CDN ADAPTER] or [STORAGE ADAPTER] messages
```

**Quick Fix:**
```bash
# Rollback to Supabase
sed -i 's/VITE_STORAGE_BACKEND=cloudfront/VITE_STORAGE_BACKEND=supabase/' .env
npm run dev
```

### CORS Errors

**Check R2 CORS in Cloudflare Dashboard:**
```json
{
  "AllowedOrigins": ["*"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"]
}
```

### Track Not Syncing

**Check track exists:**
```sql
SELECT track_id, file_path, deleted_at
FROM audio_tracks
WHERE track_id = 'YOUR_TRACK_ID';
```

**Requirements:**
- ✅ `file_path` is not null
- ✅ `deleted_at` is null
- ✅ File exists in Supabase storage

---

## 💡 Quick Commands

### Deploy
```bash
npx supabase functions deploy sync-to-cdn
```

### Test
```bash
npm run test-cdn-sync
```

### Enable CDN
```bash
VITE_STORAGE_BACKEND=cloudfront
```

### Disable CDN
```bash
VITE_STORAGE_BACKEND=supabase
```

### Logs
```bash
npx supabase functions logs sync-to-cdn
```

### Build
```bash
npm run build
```

---

## 📈 Performance

**Expected Results:**
- Load time: <500ms (vs 1-2s from Supabase)
- Success rate: >99%
- Cost: ~$1/month for 10K tracks
- Egress: FREE (major savings)

---

## 🔗 Important URLs

**Edge Function:**
```
https://xewajlyswijmjxuajhif.supabase.co/functions/v1/sync-to-cdn
```

**CDN Base:**
```
https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev
```

**Supabase Dashboard:**
```
https://supabase.com/dashboard/project/xewajlyswijmjxuajhif
```

**Cloudflare R2 Dashboard:**
```
https://dash.cloudflare.com/[account]/r2/overview
```

---

## 📄 Documentation

- Full Analysis: `CDN_ANALYSIS_AND_FIX_REPORT.md`
- Deployment Guide: `CDN_DEPLOYMENT_GUIDE.md`
- Setup Docs: `CDN_SYNC_SETUP.md`
- Code: `supabase/functions/sync-to-cdn/index.ts`

---

**Version:** 1.0 | **Updated:** 2025-11-19 | **Status:** Production Ready
