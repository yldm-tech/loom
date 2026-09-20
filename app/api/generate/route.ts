import { composePlanned } from "@/lib/compose";
import { isDemoMode, replay } from "@/lib/demo";
import { MAX_REQUEST_CHARS } from "@/lib/edit";

export const maxDuration = 120;

/** A locale is a BCP-47 tag here, not free text: it is compared against the fixture names and against LANGUAGES, and anything else is a typo at best. */
const LOCALE_TAG = /^[a-z]{2,8}(-[a-z0-9]{2,8})*$/i;

/**
 * The prompt is checked before anything touches it because of what happens next: lib/compose.ts copies it into seventeen questions of the planning round, so the upstream body is roughly seventeen times whatever arrives. Measured with a 1 MB prompt, the first outbound request was 16.22 MiB; a 33 MB prompt drove server RSS to 2 GB. One unauthenticated POST should not be able to do that, and the request is buffered by `request.json()` in any case, so the cap belongs here rather than deeper in.
 *
 * The `as` cast this opened with was erased at runtime: `{"prompt":123}` reached `prompt?.trim()` and threw out of the handler, and `request.json()` itself was outside every try, so a non-JSON body did the same. Both answered 500 where 400 was meant.
 */
export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "body must be JSON" }, { status: 400 });
  }
  const body = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  if (prompt.length > MAX_REQUEST_CHARS) {
    return Response.json(
      { error: `prompt is longer than ${MAX_REQUEST_CHARS} characters` },
      { status: 400 },
    );
  }
  const locale =
    typeof body.locale === "string" && LOCALE_TAG.test(body.locale) ? body.locale : undefined;

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
          ? replay(prompt, signal, locale)
          : composePlanned(jevKey!, llmKey!, prompt, signal, locale);
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
