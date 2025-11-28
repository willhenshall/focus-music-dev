/*
  # Enable Realtime for Channel Recommendations

  This migration enables realtime subscriptions for the channel_recommendations table.

  1. Changes
    - Add channel_recommendations table to the supabase_realtime publication

  2. Purpose
    - Allow clients to subscribe to real-time changes on channel recommendations
    - Enables automatic UI updates when users retake the quiz and get new recommendations
*/

alter publication supabase_realtime add table channel_recommendations;
