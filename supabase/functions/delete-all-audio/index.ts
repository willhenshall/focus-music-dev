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

    console.log('Listing all files in audio-files bucket...');

    // List all files
    const { data: files, error: listError } = await supabase.storage
      .from("audio-files")
      .list("", {
        limit: 10000,
      });

    if (listError) {
      throw new Error(`Failed to list files: ${listError.message}`);
    }

    if (!files || files.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          deleted: 0,
          message: "No files to delete"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Found ${files.length} files to delete`);

    // Delete all files
    const filePaths = files.map(file => file.name);

    const { data, error: deleteError } = await supabase.storage
      .from("audio-files")
      .remove(filePaths);

    if (deleteError) {
      throw new Error(`Failed to delete files: ${deleteError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted: filePaths.length,
        message: `Successfully deleted ${filePaths.length} files (MP3s and JSON sidecars)`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Delete error:", error);
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
