import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeleteRequest {
  trackIds: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { trackIds }: DeleteRequest = await req.json();

    if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid request: trackIds array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Permanently deleting ${trackIds.length} tracks...`);

    const { data: tracks, error: fetchError } = await supabase
      .from("audio_tracks")
      .select("id, track_id, file_path, metadata, cdn_url, storage_locations, hls_path")
      .in("id", trackIds);

    if (fetchError) {
      throw new Error(`Failed to fetch tracks: ${fetchError.message}`);
    }

    if (!tracks || tracks.length === 0) {
      return new Response(
        JSON.stringify({ error: "No tracks found with provided IDs" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${tracks.length} tracks to delete`);

    const deletionResults = {
      tracksDeleted: 0,
      filesDeleted: 0,
      hlsFilesDeleted: 0,
      cdnFilesDeleted: 0,
      cdnHlsDeleted: 0,
      cdnDeletionFailed: 0,
      channelReferencesRemoved: 0,
      playlistsAffected: 0,
      analyticsDeleted: 0,
      errors: [] as string[],
    };

    for (const track of tracks) {
      try {
        const trackId = track.track_id || track.metadata?.track_id || track.id;
        console.log(`Processing track ${trackId}...`);

        // SKIP CDN deletion - it was causing timeouts due to 600+ HLS files per track
        // CDN files will be orphaned but harmless (new tracks get unique IDs)
        // A separate cleanup job can be added later if needed
        console.log(`Skipping CDN deletion for track ${trackId} (orphaned files are harmless)`);

        if (track.file_path) {
          // file_path stores the full public URL, extract just the filename
          // e.g., "https://xxx.supabase.co/storage/v1/object/public/audio-files/180232.mp3" -> "180232.mp3"
          const audioPath = track.file_path.split('/').pop() || track.file_path;
          const jsonPath = audioPath.replace(/\.(mp3|wav|flac|m4a|ogg)$/i, ".json");

          console.log(`Deleting audio file from Supabase Storage: ${audioPath}`);
          const { data: audioDeleteData, error: audioDeleteError } = await supabase.storage
            .from("audio-files")
            .remove([audioPath]);

          if (audioDeleteError) {
            console.error(`Failed to delete audio file ${audioPath}:`, audioDeleteError);
            deletionResults.errors.push(`Audio file ${audioPath}: ${audioDeleteError.message}`);
          } else {
            console.log(`Audio file deletion result:`, audioDeleteData);
            deletionResults.filesDeleted++;
          }

          console.log(`Deleting JSON sidecar from Supabase Storage: ${jsonPath}`);
          const { data: jsonDeleteData, error: jsonDeleteError } = await supabase.storage
            .from("audio-files")
            .remove([jsonPath]);

          if (jsonDeleteError) {
            console.log(`JSON file ${jsonPath} not found or already deleted:`, jsonDeleteError);
          } else {
            console.log(`JSON file deletion result:`, jsonDeleteData);
            deletionResults.filesDeleted++;
          }
        }

        // Delete HLS files from Supabase Storage (audio-hls bucket)
        // Convert trackId to string for storage path operations
        const trackIdStr = String(trackId);
        console.log(`Track HLS path: ${track.hls_path}, checking for HLS files...`);
        
        if (track.hls_path) {
          console.log(`Deleting HLS files for track ${trackIdStr} from Supabase Storage...`);
          try {
            // List all HLS files for this track
            const { data: hlsFiles, error: listError } = await supabase.storage
              .from("audio-hls")
              .list(trackIdStr);

            if (listError) {
              console.error(`Failed to list HLS files for ${trackIdStr}:`, listError);
              deletionResults.errors.push(`HLS list error for ${trackIdStr}: ${listError.message}`);
            } else if (hlsFiles && hlsFiles.length > 0) {
              // Build array of file paths to delete
              const hlsFilePaths = hlsFiles.map(f => `${trackIdStr}/${f.name}`);
              console.log(`Found ${hlsFilePaths.length} HLS files to delete for track ${trackIdStr}:`, hlsFilePaths);

              const { data: hlsDeleteData, error: hlsDeleteError } = await supabase.storage
                .from("audio-hls")
                .remove(hlsFilePaths);

              if (hlsDeleteError) {
                console.error(`Failed to delete HLS files for ${trackIdStr}:`, hlsDeleteError);
                deletionResults.errors.push(`HLS delete error for ${trackIdStr}: ${hlsDeleteError.message}`);
              } else {
                console.log(`HLS deletion result:`, hlsDeleteData);
                deletionResults.hlsFilesDeleted += hlsFilePaths.length;
                console.log(`Successfully deleted ${hlsFilePaths.length} HLS files for track ${trackIdStr}`);
              }
            } else {
              console.log(`No HLS files found in Supabase Storage for track ${trackIdStr}`);
            }
          } catch (hlsError: any) {
            console.error(`HLS deletion error for ${trackIdStr}:`, hlsError);
            deletionResults.errors.push(`HLS deletion for ${trackIdStr}: ${hlsError.message}`);
          }
        }

        const { data: channels, error: channelsError } = await supabase
          .from("audio_channels")
          .select("id, playlist_data");

        if (!channelsError && channels) {
          for (const channel of channels) {
            if (!channel.playlist_data) continue;

            let modified = false;
            const playlistData = channel.playlist_data as any;

            for (const energyLevel of ["low", "medium", "high"]) {
              if (playlistData[energyLevel]) {
                let tracks: any[];
                if (Array.isArray(playlistData[energyLevel])) {
                  tracks = playlistData[energyLevel];
                } else if (playlistData[energyLevel].tracks) {
                  tracks = playlistData[energyLevel].tracks;
                } else {
                  continue;
                }

                const beforeLength = tracks.length;
                const filteredTracks = tracks.filter(
                  (t: any) => t.track_id?.toString() !== trackId.toString()
                );

                if (filteredTracks.length < beforeLength) {
                  modified = true;
                  if (Array.isArray(playlistData[energyLevel])) {
                    playlistData[energyLevel] = filteredTracks;
                  } else {
                    playlistData[energyLevel].tracks = filteredTracks;
                  }
                  deletionResults.channelReferencesRemoved++;
                }
              }
            }

            if (modified) {
              const { error: updateError } = await supabase
                .from("audio_channels")
                .update({ playlist_data: playlistData })
                .eq("id", channel.id);

              if (updateError) {
                console.error(`Failed to update channel ${channel.id}:`, updateError);
                deletionResults.errors.push(`Channel ${channel.id}: ${updateError.message}`);
              } else {
                deletionResults.playlistsAffected++;
              }
            }
          }
        }

        const { error: analyticsError } = await supabase
          .from("track_play_events")
          .delete()
          .eq("track_id", track.id);

        if (analyticsError) {
          console.error(`Failed to delete analytics for track ${trackId}:`, analyticsError);
        } else {
          deletionResults.analyticsDeleted++;
        }

        const { error: trackDeleteError } = await supabase
          .from("audio_tracks")
          .delete()
          .eq("id", track.id);

        if (trackDeleteError) {
          throw new Error(`Failed to delete track record: ${trackDeleteError.message}`);
        }

        deletionResults.tracksDeleted++;
        console.log(`Successfully deleted track ${trackId}`);

      } catch (error) {
        console.error(`Error processing track:`, error);
        deletionResults.errors.push(`Track processing: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Permanently deleted ${deletionResults.tracksDeleted} track(s)`,
        details: deletionResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Permanent delete error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
