# Audio Tracks Update - Execution Checklist

## Pre-Execution Checklist

### Environment Setup
- [ ] Verify `.env` file exists in project root
- [ ] Confirm `VITE_SUPABASE_URL` is set to `https://xewajlyswijmjxuajhif.supabase.co`
- [ ] Confirm `VITE_SUPABASE_SERVICE_ROLE_KEY` is configured
- [ ] Test connection: `npx tsx scripts/verify-tracks-status.ts`

### Database Preparation
- [ ] Open Supabase SQL Editor
- [ ] Run backup creation:
  ```sql
  CREATE TABLE audio_tracks_backup_20250119 AS SELECT * FROM audio_tracks;
  SELECT COUNT(*) FROM audio_tracks_backup_20250119;
  ```
- [ ] Verify backup has 11,233 records
- [ ] Note current NULL counts: `npx tsx scripts/verify-tracks-status.ts`

### Documentation Review
- [ ] Read `UPDATE_SUMMARY.md` for overview
- [ ] Review `AUDIO_TRACKS_NULL_FIELD_UPDATE_GUIDE.md` for details
- [ ] Have `sql/update-tracks-quick-reference.sql` open for queries

## Execution Checklist

### Step 1: Verify Current State
```bash
npx tsx scripts/verify-tracks-status.ts
```
Record current statistics:
- Total records: _______
- NULL track_id: _______
- NULL tempo: _______
- NULL speed: _______
- Old URL count: _______

### Step 2: Run Update Script
```bash
npx tsx scripts/update-null-fields-from-json.ts
```
- [ ] Script started successfully
- [ ] Backup confirmation accepted
- [ ] Batches processing without errors
- [ ] Progress updates showing
- [ ] Script completed without fatal errors

### Step 3: Record Results
From script output, record:
- Total processed: _______
- Total updated: _______
- URLs updated: _______
- Errors: _______

## Post-Execution Verification

### Database Checks
Run in Supabase SQL Editor:

```sql
-- 1. Verify record count unchanged
SELECT COUNT(*) FROM audio_tracks;
-- Should be: 11,233

-- 2. Check NULL reduction
SELECT 
  COUNT(*) FILTER (WHERE track_id IS NULL) as null_track_id,
  COUNT(*) FILTER (WHERE tempo IS NULL) as null_tempo,
  COUNT(*) FILTER (WHERE speed IS NULL) as null_speed
FROM audio_tracks;
-- Note: Should be significantly lower than before

-- 3. Verify URL update
SELECT COUNT(*) 
FROM audio_tracks 
WHERE file_path LIKE '%xewajlyswijmjxuajhif%';
-- Should be: 11,233

SELECT COUNT(*) 
FROM audio_tracks 
WHERE file_path LIKE '%eafyytltuwuxuuoevavo%';
-- Should be: 0
```

Results:
- [ ] Total count matches (11,233)
- [ ] NULL counts decreased significantly
- [ ] All URLs updated to new format
- [ ] No old URLs remain

### Sample Data Review
```sql
SELECT 
  id, track_id, tempo, speed, intensity,
  metadata->>'track_name' as track_name,
  file_path
FROM audio_tracks
WHERE updated_at > NOW() - INTERVAL '1 hour'
LIMIT 10;
```
- [ ] Sample records look correct
- [ ] Metadata populated properly
- [ ] File paths using new URL

### Application Testing
- [ ] Open Music Library in app
- [ ] Verify tracks display correctly
- [ ] Check track details modal shows metadata
- [ ] Test audio playback works
- [ ] Verify no console errors

## Post-Verification Actions

### Documentation
- [ ] Update this checklist with actual values
- [ ] Note any errors or issues encountered
- [ ] Document any tracks that couldn't be updated
- [ ] Save execution log/output

### Backup Management
- [ ] Verify backup table exists: `audio_tracks_backup_20250119`
- [ ] Add calendar reminder to review in 30 days
- [ ] Schedule backup deletion for 30 days from now

### Monitoring
- [ ] Monitor application for 24 hours
- [ ] Check for any user-reported issues
- [ ] Verify analytics continue tracking
- [ ] Confirm no performance degradation

## Rollback (Only if Critical Issues Found)

If major problems discovered:

```sql
BEGIN;
TRUNCATE audio_tracks;
INSERT INTO audio_tracks SELECT * FROM audio_tracks_backup_20250119;
COMMIT;
```

- [ ] Issue identified and documented
- [ ] Rollback SQL executed
- [ ] Verification run to confirm restoration
- [ ] Team notified of rollback

## Cleanup (After 30 Days)

Once confirmed stable:

```sql
DROP TABLE audio_tracks_backup_20250119;
```

- [ ] 30 days elapsed since update
- [ ] No issues reported
- [ ] Backup table dropped
- [ ] Cleanup confirmed

## Notes and Issues

### Execution Notes
```
Date/Time: _______
Executed by: _______
Duration: _______
```

### Issues Encountered
```
1. 
2. 
3. 
```

### Resolution Actions
```
1. 
2. 
3. 
```

## Sign-Off

- [ ] All checklist items completed
- [ ] Verification successful
- [ ] Documentation updated
- [ ] Ready for production use

**Completed by**: _______________  
**Date**: _______________  
**Signature**: _______________
