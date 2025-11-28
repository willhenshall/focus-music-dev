/*
  # Enable Realtime for System Preferences

  1. Changes
    - Enable realtime replication for `system_preferences` table
    - Allows clients to subscribe to changes in system preferences in real-time

  2. Purpose
    - When admins update system preferences (like recommendation visibility threshold)
    - User dashboards can receive the updates instantly without needing a page refresh
*/

-- Enable realtime for system_preferences table
ALTER PUBLICATION supabase_realtime ADD TABLE system_preferences;
