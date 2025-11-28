import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TestResultPayload {
  testFile: string;
  testName: string;
  suiteName?: string;
  testCommand?: string;
  description?: string;
  featureArea?: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  browser?: string;
  viewport?: string;
  testCases?: Array<{
    name: string;
    status: "passed" | "failed" | "skipped";
    durationMs: number;
    errorMessage?: string;
    retryCount?: number;
  }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const payload: TestResultPayload = await req.json();

    // Get or create test registry entry
    // Try both test_file and test_name to find existing entry
    let { data: existingTest } = await supabaseClient
      .from("playwright_test_registry")
      .select("id")
      .eq("test_file", payload.testFile)
      .maybeSingle();

    // If not found by test_file, try by test_name
    if (!existingTest) {
      const testName = payload.testName || payload.suiteName || "Test Suite";
      const { data: byName } = await supabaseClient
        .from("playwright_test_registry")
        .select("id")
        .eq("test_name", testName)
        .maybeSingle();
      existingTest = byName;
    }

    let testRegistryId: string;

    if (existingTest) {
      testRegistryId = existingTest.id;
    } else {
      // Try to insert, but if it fails due to duplicate, try to fetch again
      const { data: newTest, error: insertError } = await supabaseClient
        .from("playwright_test_registry")
        .insert({
          test_name: payload.testName || payload.suiteName || "Test Suite",
          test_file: payload.testFile,
          test_command: payload.testCommand || `npm test -- ${payload.testFile}`,
          description: payload.description || "Automated test",
          feature_area: payload.featureArea || "general",
        })
        .select("id")
        .single();

      if (insertError) {
        // If duplicate key error, try to fetch the existing one
        if (insertError.code === "23505") {
          const testName = payload.testName || payload.suiteName || "Test Suite";
          const { data: retryTest } = await supabaseClient
            .from("playwright_test_registry")
            .select("id")
            .or(`test_file.eq.${payload.testFile},test_name.eq.${testName}`)
            .maybeSingle();

          if (retryTest) {
            testRegistryId = retryTest.id;
          } else {
            throw new Error(`Failed to create or find test registry: ${insertError.message}`);
          }
        } else {
          throw new Error(`Failed to create test registry: ${insertError.message}`);
        }
      } else if (newTest) {
        testRegistryId = newTest.id;
      } else {
        throw new Error("Failed to create test registry: no data returned");
      }
    }

    // Create test run
    const { data: runData, error: runError } = await supabaseClient
      .from("playwright_test_runs")
      .insert({
        test_id: testRegistryId,
        run_date: new Date().toISOString(),
        status: payload.status,
        duration_ms: payload.durationMs,
        passed_count: payload.passedCount,
        failed_count: payload.failedCount,
        skipped_count: payload.skippedCount,
        browser: payload.browser || "chromium",
        viewport: payload.viewport || "1280x720",
      })
      .select("id")
      .single();

    if (runError || !runData) {
      throw new Error(`Failed to create test run: ${runError?.message}`);
    }

    // Insert test cases if provided
    if (payload.testCases && payload.testCases.length > 0) {
      const testCaseInserts = payload.testCases.map((tc) => ({
        run_id: runData.id,
        test_name: tc.name,
        status: tc.status,
        duration_ms: tc.durationMs,
        error_message: tc.errorMessage || null,
        retry_count: tc.retryCount || 0,
      }));

      const { error: casesError } = await supabaseClient
        .from("playwright_test_cases")
        .insert(testCaseInserts);

      if (casesError) {
        console.error("Failed to insert test cases:", casesError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        runId: runData.id,
        testRegistryId,
        message: "Test result recorded successfully",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error recording test result:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
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
