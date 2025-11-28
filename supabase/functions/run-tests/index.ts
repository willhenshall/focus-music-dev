import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode("Running Playwright tests...\n\n"));

          const command = new Deno.Command("npx", {
            args: ["playwright", "test", "--reporter=line"],
            stdout: "piped",
            stderr: "piped",
          });

          const process = command.spawn();

          const decoder = new TextDecoder();
          const reader = process.stdout.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            controller.enqueue(encoder.encode(text));
          }

          const { code } = await process.status;

          if (code === 0) {
            controller.enqueue(encoder.encode("\n✓ All tests passed!\n"));
          } else {
            controller.enqueue(encoder.encode(`\n✗ Tests failed with exit code ${code}\n`));
          }

          controller.close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(`\nError running tests: ${error.message}\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to run tests",
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
