/*
  # Create Delete User Function for GDPR Compliance

  1. New Functions
    - `delete_user()` - Allows authenticated users to delete their own account
      - This function deletes the user's auth record
      - Related data in other tables is automatically deleted via CASCADE constraints
  
  2. Security
    - Function is callable by authenticated users only
    - Users can only delete their own account (checked via auth.uid())
    - Function uses SECURITY DEFINER to allow deletion of auth.users record
  
  3. Notes
    - This enables GDPR-compliant account deletion
    - The user_profiles, quiz_responses, and user_preferences should be deleted first by the application
    - Due to CASCADE constraints on user_profiles, deleting the auth user will clean up any remaining data
*/

-- Create function to allow users to delete their own account
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete the user's auth record (this will cascade to user_profiles due to FK constraint)
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user() TO authenticated;
