# CRITICAL: Fix API Keys to Restore Database Access

## Problem Identified

Your API keys are **INVALID** for database `xewajlyswijmjxuajhif.supabase.co`.

This explains:
- ❌ Why MCP tools don't work
- ❌ Why direct API calls fail
- ❌ Why you can't export data programmatically
- ❌ Why you're stuck in a loop

## Root Cause

During your failed migration attempt 2 weeks ago, the API keys got corrupted or invalidated when you:
1. Connected to a new database
2. Disconnected from it
3. Tried to return to the Bolt-provisioned database

## Immediate Solution

### Option 1: Get Keys from Supabase Dashboard (Fastest)

1. **Go to your project dashboard:**
   ```
   https://supabase.com/dashboard/project/xewajlyswijmjxuajhif
   ```

2. **Navigate to:** Settings → API

3. **Copy the correct keys:**
   - Project URL
   - `anon` public key
   - `service_role` secret key

4. **Update your `.env` file:**
   ```env
   SUPABASE_URL=https://xewajlyswijmjxuajhif.supabase.co
   SUPABASE_ANON_KEY=[paste anon key from dashboard]
   SUPABASE_SERVICE_ROLE_KEY=[paste service_role key from dashboard]

   VITE_SUPABASE_URL=https://xewajlyswijmjxuajhif.supabase.co
   VITE_SUPABASE_ANON_KEY=[paste same anon key]
   VITE_SUPABASE_SERVICE_ROLE_KEY=[paste same service_role key]
   ```

5. **Update `.bolt/config.json`:**
   ```json
   {
     "supabase": {
       "url": "https://xewajlyswijmjxuajhif.supabase.co",
       "anonKey": "[paste anon key]",
       "serviceRoleKey": "[paste service_role key]"
     }
   }
   ```

### Option 2: Contact Bolt Support

If you don't have dashboard access to `xewajlyswijmjxuajhif`:
- Contact Bolt support
- Explain the API keys stopped working after migration attempt
- Request fresh keys or database access restoration

### Option 3: Use Supabase CLI (If you have it)

```bash
supabase projects list
supabase projects api-keys --project-ref xewajlyswijmjxuajhif
```

## After Fixing Keys

### Test Connection:
```bash
npx tsx scripts/test-direct-connection.ts
```

Should show:
```
✅ Can query metadata
✅ Successfully queried audio_channels
✅ Successfully queried user_profiles
✅ REST API working
```

### Then Export Data:
```bash
# This will finally work!
npx tsx scripts/export-via-postgres.ts
```

## Why This Matters

Once API keys are fixed:
- ✅ MCP tools will work
- ✅ Direct database export will work
- ✅ No need for manual CSV export
- ✅ Can export complete database in 5 minutes

## Alternative: If You Can't Fix Keys

If you absolutely cannot get the correct API keys:

1. **You MUST use Supabase Dashboard to export**
   - Go to Table Editor
   - Export all 19 tables manually to CSV
   - This is tedious but will work

2. **Or migrate without data**
   - Use `COMPLETE_DATABASE_EXPORT.sql` for schema only
   - Start fresh in new database
   - Manually recreate critical data

## Current Key Status

**These keys are INVALID:**
- First 20 chars: `eyJhbGciOiJIUzI1NiIs...`
- Error: `Invalid API key`
- Result: All database operations fail

## Verification

After updating keys, the test should pass:

```bash
# Should return 200, not 401
curl -X GET \
  'https://xewajlyswijmjxuajhif.supabase.co/rest/v1/audio_channels?select=count' \
  -H "apikey: YOUR_NEW_ANON_KEY" \
  -H "Authorization: Bearer YOUR_NEW_ANON_KEY"
```

---

**PRIORITY:** Get correct API keys from dashboard ASAP to unblock the migration.
