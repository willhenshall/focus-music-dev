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

    // Parse request body for pagination
    const body = await req.json().catch(() => ({}));
    const offset = body.offset || 0;
    const limit = body.limit || 500;

    console.log(`Listing files from audio-files bucket (offset: ${offset}, limit: ${limit})...`);

    const { data: files, error: listError} = await supabase.storage
      .from("audio-files")
      .list("", {
        limit: limit * 2, // Get more files than needed since we'll filter
        offset,
      });

    if (listError) {
      throw new Error(`Failed to list files: ${listError.message}`);
    }

    const audioFiles = files.filter(
      (f) =>
        f.name.endsWith(".mp3") ||
        f.name.endsWith(".wav") ||
        f.name.endsWith(".m4a") ||
        f.name.endsWith(".flac") ||
        f.name.endsWith(".aac") ||
        f.name.endsWith(".ogg") ||
        f.name.endsWith(".opus")
    );

    const jsonFiles = files.filter((f) => f.name.endsWith(".json")).slice(0, limit);

    console.log(`Found ${audioFiles.length} audio files, ${jsonFiles.length} JSON files in this batch`);

    const jsonMap = new Map<string, any>();

    for (const jsonFile of jsonFiles) {
      const trackId = jsonFile.name.replace(".json", "");

      const { data: jsonData, error: jsonError } = await supabase.storage
        .from("audio-files")
        .download(jsonFile.name);

      if (!jsonError && jsonData) {
        try {
          const text = await jsonData.text();
          const metadata = JSON.parse(text);
          jsonMap.set(trackId, metadata);
        } catch (e) {
          console.log(`Failed to parse ${jsonFile.name}:`, e);
        }
      }
    }

    console.log(`Loaded ${jsonMap.size} JSON metadata files`);

    let created = 0;
    let skipped = 0;
    let errors: string[] = [];

    // Only process audio files that have matching JSON
    const audioFilesToProcess = audioFiles.filter(af => {
      const trackId = af.name.replace(/\.(mp3|wav|m4a|flac|aac|ogg|opus)$/i, "");
      return jsonMap.has(trackId);
    }).slice(0, limit);

    console.log(`Processing ${audioFilesToProcess.length} audio files with metadata`);

    for (const audioFile of audioFilesToProcess) {
      try {
        const trackId = audioFile.name.replace(/\.(mp3|wav|m4a|flac|aac|ogg|opus)$/i, "");
        const jsonData = jsonMap.get(trackId);

        if (!jsonData) {
          errors.push(`No JSON metadata for ${trackId}`);
          skipped++;
          continue;
        }

        const jsonMetadata = jsonData.metadata?.metadata || jsonData.metadata || jsonData;

        const { data: publicUrlData } = supabase.storage
          .from("audio-files")
          .getPublicUrl(audioFile.name);

        const { data: existingTrack } = await supabase
          .from("audio_tracks")
          .select("id")
          .eq("file_path", publicUrlData.publicUrl)
          .maybeSingle();

        if (existingTrack) {
          skipped++;
          continue;
        }

        const durationValue = jsonMetadata.duration_seconds || jsonMetadata.duration || 0;
        const durationSeconds = typeof durationValue === 'string'
          ? Math.round(parseFloat(durationValue))
          : Math.round(durationValue);

        // Store all metadata from JSON file, plus add computed fields
        const metadata = {
          ...jsonMetadata,
          track_id: jsonMetadata.track_id || trackId,
          track_name: jsonMetadata.track_name || jsonMetadata.title || trackId,
          artist_name: jsonMetadata.artist_name || jsonMetadata.artist || "Focus.Music",
          album_name: jsonMetadata.album_name || jsonMetadata.album,
          duration_seconds: durationSeconds,
          file_size_bytes: audioFile.metadata?.size || jsonMetadata.file_length || 0,
          file_name: audioFile.name,
          file_format: audioFile.name.split(".").pop()?.toLowerCase(),
        };

        const { error: insertError } = await supabase
          .from("audio_tracks")
          .insert({
            file_path: publicUrlData.publicUrl,
            duration_seconds: durationSeconds,
            metadata: metadata,
          });

        if (insertError) {
          errors.push(`Insert failed for ${trackId}: ${insertError.message}`);
        } else {
          created++;
          if (created % 10 === 0) {
            console.log(`Created ${created} tracks...`);
          }
        }
      } catch (error) {
        errors.push(`Error processing ${audioFile.name}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        created,
        skipped,
        errors: errors.length,
        error_details: errors.slice(0, 20),
        total_audio_files: audioFilesToProcess.length,
        total_json_files: jsonFiles.length,
        message: `Imported ${created} tracks from storage (batch offset: ${offset})`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Import error:", error);
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