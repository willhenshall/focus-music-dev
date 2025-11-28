/*
  # Add admin functionality
  
  1. Changes
    - Add `is_admin` column to `user_profiles` table
    - Default to false for security
    - Set existing user as admin
  
  2. Security
    - Only admins can access admin dashboard
*/

-- Add is_admin column
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Set the existing user as admin
UPDATE user_profiles 
SET is_admin = true 
WHERE id = 'ff95e67a-f522-4202-826f-b56d6aba07bf';
