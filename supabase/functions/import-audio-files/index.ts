import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    const { storageBucket, channelMapping, dryRun = false } = await req.json();

    if (!storageBucket) {
      return new Response(
        JSON.stringify({ error: "storageBucket parameter required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: files, error: listError } = await supabase.storage
      .from(storageBucket)
      .list();

    if (listError) {
      throw new Error(`Failed to list files: ${listError.message}`);
    }

    const audioFiles = files.filter(
      (f) => f.name.endsWith(".mp3") || f.name.endsWith(".wav") || f.name.endsWith(".m4a")
    );

    const results = {
      processed: 0,
      inserted: 0,
      skipped: 0,
      errors: [] as string[],
      dryRun,
    };

    for (const file of audioFiles) {
      try {
        const trackId = file.name.split(".")[0];
        const sidecarPath = `${trackId}.json`;

        const { data: jsonFile, error: jsonError } = await supabase.storage
          .from(storageBucket)
          .download(sidecarPath);

        if (jsonError || !jsonFile) {
          results.errors.push(`Missing sidecar for ${file.name}`);
          results.skipped++;
          continue;
        }

        const metadataText = await jsonFile.text();
        const metadata = JSON.parse(metadataText);

        const channelIds = metadata.channel_ids
          ? metadata.channel_ids.split(',').map((id: string) => parseInt(id.trim())).filter((id: number) => !isNaN(id))
          : [];

        if (channelIds.length === 0) {
          results.errors.push(`No valid channel_ids for ${file.name}`);
          results.skipped++;
          continue;
        }

        const primaryChannelId = channelIds[0];

        let channelNumber = primaryChannelId;
        if (channelMapping && channelMapping[primaryChannelId]) {
          channelNumber = channelMapping[primaryChannelId];
        }

        const { data: channelData } = await supabase
          .from("audio_channels")
          .select("id")
          .eq("channel_number", channelNumber)
          .maybeSingle();

        if (!channelData) {
          results.errors.push(`Channel ${channelNumber} not found for ${file.name} (original id: ${primaryChannelId})`);
          results.skipped++;
          continue;
        }

        const energyValue = metadata.energy ? metadata.energy.toLowerCase() : "";
        let energyLevel: string | null = null;
        if (energyValue === "low" || energyValue === "medium" || energyValue === "high") {
          energyLevel = energyValue;
        }

        const durationSeconds = metadata.duration
          ? Math.round(parseFloat(metadata.duration))
          : 300;

        const fileSizeBytes = file.metadata?.size || null;

        const { data: publicUrlData } = supabase.storage
          .from(storageBucket)
          .getPublicUrl(file.name);

        if (!dryRun) {
          const { data: existingTrack } = await supabase
            .from("audio_tracks")
            .select("id")
            .eq("file_path", publicUrlData.publicUrl)
            .maybeSingle();

          if (existingTrack) {
            results.skipped++;
            results.processed++;
            continue;
          }

          const enrichedMetadata = {
            ...metadata,
            file_size: fileSizeBytes
          };

          const { error: insertError } = await supabase
            .from("audio_tracks")
            .insert({
              channel_id: channelData.id,
              energy_level: energyLevel,
              file_path: publicUrlData.publicUrl,
              duration_seconds: durationSeconds,
              metadata: enrichedMetadata,
              skip_rate: 0.0,
            });

          if (insertError) {
            results.errors.push(`Insert failed for ${file.name}: ${insertError.message}`);
          } else {
            results.inserted++;
          }
        } else {
          results.inserted++;
        }

        results.processed++;

        if (results.processed % 100 === 0) {
          console.log(`Processed ${results.processed}/${audioFiles.length} files`);
        }
      } catch (error) {
        results.errors.push(`Error processing ${file.name}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        message: dryRun
          ? "Dry run completed - no data was inserted"
          : "Import completed",
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
