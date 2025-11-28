# Security Configuration

## Leaked Password Protection

**Status:** ⚠️ Manual Configuration Required

Supabase Auth can prevent the use of compromised passwords by checking against HaveIBeenPwned.org. This feature must be manually enabled in the Supabase Dashboard.

### How to Enable

1. Log in to your Supabase Dashboard
2. Navigate to: **Authentication** → **Settings**
3. Scroll to **Security and Protection** section
4. Enable **"Leaked Password Protection"**
5. Save changes

### What This Does

- Checks user passwords against the HaveIBeenPwned database during registration and password changes
- Prevents users from choosing passwords that have been exposed in known data breaches
- Enhances overall account security without requiring code changes

### Verification

After enabling, test by attempting to register with a known compromised password (e.g., "password123"). The registration should be rejected with an appropriate error message.

---

## Security Fixes Applied

The following security issues have been resolved via database migration:

### 1. Missing Foreign Key Index
- ✅ Added index on `saved_slot_sequences.channel_id`
- Improves query performance for foreign key lookups

### 2. Unused Indexes Removed
- ✅ Dropped 19 unused indexes
- Reduces database overhead and improves write performance

### 3. Multiple Permissive Policies Consolidated
- ✅ Consolidated 72 permissive policies into 24 optimized policies
- Reduces policy evaluation overhead
- Maintains same security guarantees
- Improves query performance

### 4. Function Search Path Security
- ✅ Fixed `is_admin()` function with secure search_path
- ✅ Fixed `update_saved_sequences_updated_at()` trigger with secure search_path
- Prevents SQL injection attacks via search_path manipulation

---

## Migration Applied

Migration file: `20251029160000_fix_security_issues.sql`

All database security fixes have been applied automatically. Only the Leaked Password Protection requires manual configuration in the Supabase Dashboard.
