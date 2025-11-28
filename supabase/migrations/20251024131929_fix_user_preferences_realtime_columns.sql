/*
  # Fix User Preferences Realtime Updates

  1. Changes
    - Set replica identity to FULL for user_preferences table
    - This ensures realtime subscriptions receive all column values in the payload
    - Required for the timer debug toggle to work properly via realtime updates

  2. Why This is Needed
    - By default, Postgres only sends the primary key in realtime updates
    - We need all columns (especially show_timer_debug) in the realtime payload
    - This allows SessionTimer to react immediately to preference changes
*/

-- Set replica identity to FULL so realtime updates include all columns
ALTER TABLE user_preferences REPLICA IDENTITY FULL;
