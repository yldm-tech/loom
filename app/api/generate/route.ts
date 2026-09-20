import { composePlanned } from "@/lib/compose";
import { isDemoMode, replay } from "@/lib/demo";

export const maxDuration = 120;

export async function POST(request: Request) {
  const { prompt } = (await request.json()) as { prompt?: string };
  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const jevKey = process.env.JEV_TOKEN?.trim();
  const llmKey = process.env.LLM_TOKEN?.trim();
  const demo = isDemoMode();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      const signal = AbortSignal.timeout(110_000);
      try {
        // Without keys the app still runs, replaying a recorded session rather
        // than refusing to start. Every event is flagged so the UI can say so.
        const events = demo
          ? replay(prompt, signal)
          : composePlanned(jevKey!, llmKey!, prompt, signal);
        for await (const event of events) send(event);
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Loom-Mode": demo ? "demo" : "live",
    },
  });
}
