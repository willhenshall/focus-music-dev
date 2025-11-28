import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const twentyEightDaysAgo = new Date();
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

    const { data: tracksToDelete, error: fetchError } = await supabase
      .from("audio_tracks")
      .select("id, file_path, metadata")
      .not("deleted_at", "is", null)
      .lt("deleted_at", twentyEightDaysAgo.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    if (!tracksToDelete || tracksToDelete.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No tracks to delete",
          deleted: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const deletedFiles: string[] = [];
    const failedFiles: string[] = [];

    for (const track of tracksToDelete) {
      try {
        if (track.file_path) {
          const { error: storageError } = await supabase.storage
            .from("audio-tracks")
            .remove([track.file_path]);

          if (storageError) {
            console.error(`Failed to delete file ${track.file_path}:`, storageError);
            failedFiles.push(track.file_path);
          } else {
            deletedFiles.push(track.file_path);
          }
        }

        if (track.metadata?.track_id) {
          const sidecarPath = `${track.metadata.track_id}.json`;
          await supabase.storage
            .from("audio-sidecars")
            .remove([sidecarPath]);
        }
      } catch (error) {
        console.error(`Error deleting storage files for track ${track.id}:`, error);
        failedFiles.push(track.file_path || track.id);
      }
    }

    const trackIds = tracksToDelete.map((t) => t.id);
    const { error: deleteError } = await supabase
      .from("audio_tracks")
      .delete()
      .in("id", trackIds);

    if (deleteError) {
      throw deleteError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted: tracksToDelete.length,
        deletedFiles: deletedFiles.length,
        failedFiles: failedFiles.length,
        trackIds,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in cleanup-deleted-tracks:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
