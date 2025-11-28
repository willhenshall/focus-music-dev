/*
  # Cleanup duplicate user_profiles policies

  Remove the old "Users can view own profile" policy since we have the newer
  "Users can view own profile or all if admin" policy that supersedes it.
*/

DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
