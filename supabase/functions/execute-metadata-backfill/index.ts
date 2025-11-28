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

    // Get batch number from request (1-23)
    const body = await req.json().catch(() => ({}));
    const batchNumber = body.batchNumber || 1;

    console.log(`Executing metadata backfill batch ${batchNumber}/23...`);

    // Download the CSV data
    const csvUrl = "https://docs.google.com/spreadsheets/d/1MDQ6thhSJ1xeLAozGsP0qwqR-O37kuNgagQ0KHDi3WM/export?format=csv";
    const csvResponse = await fetch(csvUrl);
    const csvText = await csvResponse.text();
    const lines = csvText.split('\n');
    const headers = lines[0].split(',');

    // Parse CSV
    const records = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = lines[i].split(',');
      const record: any = {};
      headers.forEach((header, idx) => {
        record[header.trim()] = values[idx]?.trim() || null;
      });
      records.push(record);
    }

    console.log(`Parsed ${records.length} records from CSV`);

    // Calculate batch range (500 records per batch, batch 23 has 285)
    const batchSize = 500;
    const startIdx = (batchNumber - 1) * batchSize;
    const endIdx = Math.min(startIdx + batchSize, records.length);
    const batchRecords = records.slice(startIdx, endIdx);

    console.log(`Processing batch ${batchNumber}: records ${startIdx} to ${endIdx} (${batchRecords.length} records)`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each record in this batch
    for (const record of batchRecords) {
      try {
        const trackId = parseInt(record.track_id);
        if (!trackId) {
          skipped++;
          continue;
        }

        // Build update object with only non-null CSV values
        const updates: any = {};
        if (record.tempo) updates.tempo = parseInt(record.tempo) || null;
        if (record.catalog) updates.catalog = record.catalog;
        if (record.locked) updates.locked = record.locked === 'true' || record.locked === '1';
        if (record.track_user_genre_id) updates.track_user_genre_id = parseInt(record.track_user_genre_id) || null;
        if (record.speed) updates.speed = parseFloat(record.speed) || null;
        if (record.intensity) updates.intensity = parseFloat(record.intensity) || null;
        if (record.arousal) updates.arousal = parseFloat(record.arousal) || null;
        if (record.valence) updates.valence = parseFloat(record.valence) || null;
        if (record.brightness) updates.brightness = parseFloat(record.brightness) || null;
        if (record.complexity) updates.complexity = parseFloat(record.complexity) || null;
        if (record.music_key_value) updates.music_key_value = record.music_key_value;
        if (record.energy_set) updates.energy_set = record.energy_set;

        // Only update if we have data and the track exists
        if (Object.keys(updates).length > 0) {
          // Use a query that checks how many rows were affected
          const { data, error: updateError, count } = await supabase
            .from('audio_tracks')
            .update(updates)
            .eq('track_id', trackId.toString())
            .is('deleted_at', null)
            .select('id', { count: 'exact', head: true });

          if (updateError) {
            console.error(`Error updating track ${trackId}:`, updateError.message);
            errors++;
          } else if (count === 0) {
            // Track doesn't exist or no rows matched
            skipped++;
          } else {
            // Successfully updated
            updated++;
          }
        } else {
          // No updates to make for this record
          skipped++;
        }
      } catch (err) {
        console.error('Error processing record:', err);
        errors++;
      }
    }

    // Record progress
    await supabase.from('metadata_backfill_progress').upsert({
      batch_number: batchNumber,
      tracks_updated: updated,
    });

    return new Response(
      JSON.stringify({
        success: true,
        batch: batchNumber,
        total_batches: 23,
        records_in_batch: batchRecords.length,
        updated,
        skipped,
        errors,
        message: `Batch ${batchNumber}/23: ${updated} updated, ${skipped} skipped, ${errors} errors`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Backfill error:", error);
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