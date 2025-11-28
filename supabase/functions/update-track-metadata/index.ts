import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { offset = 0, limit = 100 } = await req.json();

    console.log(`Processing batch: offset=${offset}, limit=${limit}`);

    const { data: tracks, error: tracksError } = await supabase
      .from("audio_tracks")
      .select("id, metadata")
      .range(offset, offset + limit - 1);

    if (tracksError) {
      throw new Error(`Failed to fetch tracks: ${tracksError.message}`);
    }

    if (!tracks || tracks.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          updated: 0,
          errors: 0,
          hasMore: false,
          nextOffset: offset,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let updated = 0;
    let errors = 0;

    for (const track of tracks) {
      try {
        const trackId = track.metadata?.track_id;
        if (!trackId) {
          errors++;
          continue;
        }

        const { data: sidecarData, error: downloadError } = await supabase.storage
          .from("audio-files")
          .download(`${trackId}.json`);

        if (downloadError || !sidecarData) {
          errors++;
          continue;
        }

        const text = await sidecarData.text();
        const sidecarJson = JSON.parse(text);

        // Handle nested metadata structure
        const meta = sidecarJson.metadata || sidecarJson;

        // Parse duration to integer
        let durationSecs = 0;
        if (meta.duration_seconds) {
          durationSecs = Math.round(parseFloat(meta.duration_seconds));
        } else if (meta.duration) {
          durationSecs = Math.round(parseFloat(meta.duration));
        }

        const updatedMetadata = {
          ...track.metadata,
          track_name: meta.track_name || meta.title || trackId,
          artist_name: meta.artist_name || meta.artist || "Focus.Music",
          album: meta.album_name || meta.album,
          duration: meta.duration,
          duration_seconds: durationSecs,
          bpm: meta.tempo || meta.bpm,
          key: meta.key,
          genre: meta.genre_category || meta.genre,
          file_size: meta.file_length || meta.file_size,
          spotify_uri: meta.spotify_uri,
        };

        const { error: updateError } = await supabase
          .from("audio_tracks")
          .update({
            metadata: updatedMetadata,
            duration_seconds: durationSecs
          })
          .eq("id", track.id);

        if (updateError) {
          errors++;
          console.error(`Failed to update track ${trackId}:`, updateError);
        } else {
          updated++;
        }
      } catch (e) {
        errors++;
        console.error(`Error processing track:`, e);
      }
    }

    const hasMore = tracks.length === limit;
    const nextOffset = offset + limit;

    return new Response(
      JSON.stringify({
        success: true,
        processed: tracks.length,
        updated,
        errors,
        hasMore,
        nextOffset,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Update error:", error);
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
