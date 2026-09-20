import { composePlanned } from "@/lib/compose";

export const maxDuration = 120;

export async function POST(request: Request) {
  const jevKey = process.env.JEV_TOKEN?.trim();
  const llmKey = process.env.LLM_TOKEN?.trim();
  if (!jevKey || !llmKey) {
    return Response.json(
      { error: "JEV_TOKEN 和 LLM_TOKEN 都需要配置，见 .env.example" },
      { status: 500 },
    );
  }

  const { prompt } = (await request.json()) as { prompt?: string };
  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      try {
        for await (const event of composePlanned(
          jevKey,
          llmKey,
          prompt,
          AbortSignal.timeout(110_000),
        )) {
          send(event);
        }
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
    },
  });
}
