/*
  # Enable Realtime for Audio Channels

  1. Changes
    - Enable realtime publication for the audio_channels table
    - This allows clients to subscribe to real-time updates when channel data changes
    - Specifically needed for live updates of display_order changes
  
  2. Notes
    - Users will automatically see channel order updates without manual refresh
    - No action required from users - updates happen silently in the background
*/

-- Enable realtime for audio_channels table
ALTER PUBLICATION supabase_realtime ADD TABLE audio_channels;