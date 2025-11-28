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