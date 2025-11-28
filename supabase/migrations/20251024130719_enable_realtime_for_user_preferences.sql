/*
  # Enable Realtime for User Preferences

  1. Changes
    - Enable realtime updates for the `user_preferences` table
    - Allows SessionTimer to receive live updates when timer debug preference changes

  2. Notes
    - This enables the realtime subscription in SessionTimer component
    - Changes to user preferences will now propagate immediately without page reload
*/

-- Enable realtime for user_preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE user_preferences;