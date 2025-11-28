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
      .select("id, track_id, file_path, metadata, cdn_url, storage_locations")
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
      cdnFilesDeleted: 0,
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

        // Delete from CDN (Cloudflare R2) FIRST, before deleting from database
        // Pass track data directly to avoid database lookup (which would fail after deletion)
        console.log(`Deleting track ${trackId} from CDN...`);
        try {
          const cdnResponse = await fetch(
            `${supabaseUrl}/functions/v1/sync-to-cdn`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                trackId: trackId.toString(),
                operation: 'delete',
                // Provide track data directly to avoid database lookup
                trackData: {
                  cdn_url: track.cdn_url,
                  metadata: track.metadata,
                  storage_locations: track.storage_locations,
                },
              }),
            }
          );

          // Log response status for debugging
          console.log(`CDN Response Status: ${cdnResponse.status} ${cdnResponse.statusText}`);

          if (!cdnResponse.ok) {
            const errorText = await cdnResponse.text();
            console.error(`CDN request failed with status ${cdnResponse.status}: ${errorText}`);
            deletionResults.cdnDeletionFailed += 2;
            deletionResults.errors.push(`CDN HTTP error ${cdnResponse.status}: ${errorText}`);
            continue; // Skip to next track
          }

          const cdnResult = await cdnResponse.json();
          console.log(`CDN Result for track ${trackId}:`, JSON.stringify(cdnResult, null, 2));

          if (cdnResult.success && cdnResult.verified) {
            // Both audio and metadata verified as deleted
            if (cdnResult.details.audioFile.deleted && cdnResult.details.metadataFile.deleted) {
              deletionResults.cdnFilesDeleted += 2; // audio + metadata
              console.log(`Successfully deleted and verified track ${trackId} from CDN`);
            } else {
              // Partial deletion
              if (cdnResult.details.audioFile.deleted) {
                deletionResults.cdnFilesDeleted++;
              } else {
                deletionResults.cdnDeletionFailed++;
                deletionResults.errors.push(`CDN audio file for ${trackId}: ${cdnResult.details.audioFile.error || 'Still exists'}`);
              }
              if (cdnResult.details.metadataFile.deleted) {
                deletionResults.cdnFilesDeleted++;
              } else {
                deletionResults.cdnDeletionFailed++;
                deletionResults.errors.push(`CDN metadata file for ${trackId}: ${cdnResult.details.metadataFile.error || 'Still exists'}`);
              }
            }
          } else {
            const errorMsg = cdnResult.error || cdnResult.message || 'CDN deletion failed';
            console.error(`CDN deletion failed for track ${trackId}:`, errorMsg);
            deletionResults.cdnDeletionFailed += 2; // both audio and metadata failed
            deletionResults.errors.push(`CDN deletion for ${trackId}: ${errorMsg}`);
          }
        } catch (cdnError: any) {
          console.error(`CDN deletion error for track ${trackId}:`, cdnError);
          deletionResults.cdnDeletionFailed += 2;
          deletionResults.errors.push(`CDN deletion for ${trackId}: ${cdnError.message}`);
        }

        if (track.file_path) {
          const audioPath = track.file_path;
          const jsonPath = track.file_path.replace(/\.(mp3|wav|flac|m4a|ogg)$/i, ".json");

          const { error: audioDeleteError } = await supabase.storage
            .from("audio-files")
            .remove([audioPath]);

          if (audioDeleteError) {
            console.error(`Failed to delete audio file ${audioPath}:`, audioDeleteError);
            deletionResults.errors.push(`Audio file ${audioPath}: ${audioDeleteError.message}`);
          } else {
            deletionResults.filesDeleted++;
          }

          const { error: jsonDeleteError } = await supabase.storage
            .from("audio-files")
            .remove([jsonPath]);

          if (jsonDeleteError) {
            console.log(`JSON file ${jsonPath} not found or already deleted`);
          } else {
            deletionResults.filesDeleted++;
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
