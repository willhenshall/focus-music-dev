import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CSVRow {
  track_id: number;
  track_name: string;
  artist_name: string;
  tempo: number;
  locked: boolean;
  speed: number;
  intensity: number;
  arousal: number;
  valence: number;
  brightness: number;
  complexity: number;
  energy_set: number;
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { rows } = await req.json() as { rows: CSVRow[] };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      throw new Error("No data provided");
    }

    console.log(`Processing batch of ${rows.length} tracks`);

    let updated = 0;
    let notFound = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (const row of rows) {
      try {
        // Query using track_id column
        const { data: existing, error: fetchError } = await supabase
          .from("audio_tracks")
          .select("id")
          .eq("track_id", String(row.track_id))
          .maybeSingle();

        if (fetchError) {
          errors++;
          errorDetails.push(`Track ${row.track_id}: ${fetchError.message}`);
          console.error(`Fetch error for track ${row.track_id}:`, fetchError);
          continue;
        }

        if (!existing) {
          notFound++;
          continue;
        }

        const { error: updateError } = await supabase
          .from("audio_tracks")
          .update({
            tempo: row.tempo,
            locked: row.locked,
            speed: row.speed,
            intensity: row.intensity,
            arousal: row.arousal,
            valence: row.valence,
            brightness: row.brightness,
            complexity: row.complexity,
            energy_set: row.energy_set,
          })
          .eq("id", existing.id);

        if (updateError) {
          errors++;
          errorDetails.push(`Track ${row.track_id}: ${updateError.message}`);
          console.error(`Update error for track ${row.track_id}:`, updateError);
          continue;
        }

        updated++;
      } catch (err) {
        errors++;
        const errMsg = err instanceof Error ? err.message : String(err);
        errorDetails.push(`Track ${row.track_id}: ${errMsg}`);
        console.error(`Exception for track ${row.track_id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: rows.length,
        updated,
        notFound,
        errors,
        errorDetails: errorDetails.slice(0, 10),
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
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
