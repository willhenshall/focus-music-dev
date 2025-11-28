/*
  # Enable Realtime for User Image Preferences

  1. Changes
    - Enable realtime for `user_image_preferences` table
    - Allows frontend to receive live updates when image set selections change
    - Ensures channel card images update immediately when user selects a different image set
*/

-- Enable realtime for user_image_preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE user_image_preferences;
