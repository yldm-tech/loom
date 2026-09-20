import { MAX_REQUEST_CHARS, editPlan } from "@/lib/edit";
import { isDemoMode, replayEdit } from "@/lib/demo";
import { ARCHETYPES, SLOTS, type ArchetypeKey, type SlotKey } from "@/lib/plan";
import { THEMES } from "@/lib/themes";

export const maxDuration = 60;

const DEFAULT_THEME = "forest";

/**
 * Everything below the boundary trusts its arguments, so the boundary has to earn that: the `as` cast this handler used to open with was erased at runtime, and a body of `{"prompt":123}` reached `prompt.trim()` — a TypeError thrown out of the handler, a 500 where the very next line meant to answer 400. `request.json()` sat outside the try as well, so a body that was not JSON did the same. The endpoint is advertised to agents in lib/llms.ts, which makes hand-written bodies an expected input rather than a hypothetical one.
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

  // Unknown slot keys, theme keys and variant ids are dropped rather than rejected: they are interpolated into Jev's instructions, and the catalogues are the only authority on what is real.
  const present = Array.isArray(body.present)
    ? body.present.filter((slot): slot is SlotKey => typeof slot === "string" && slot in SLOTS)
    : [];
  const theme =
    typeof body.theme === "string" && body.theme in THEMES ? body.theme : DEFAULT_THEME;
  const archetype =
    typeof body.archetype === "string" && body.archetype in ARCHETYPES
      ? (body.archetype as ArchetypeKey)
      : undefined;
  const variants: Partial<Record<SlotKey, string>> = {};
  if (typeof body.variants === "object" && body.variants !== null && !Array.isArray(body.variants)) {
    for (const [slot, variant] of Object.entries(body.variants as Record<string, unknown>)) {
      if (!(slot in SLOTS)) continue;
      if (typeof variant !== "string") continue;
      if (!(variant in SLOTS[slot as SlotKey].variants)) continue;
      variants[slot as SlotKey] = variant;
    }
  }

  const started = Date.now();
  if (isDemoMode()) {
    return Response.json({
      ...replayEdit(prompt, present, theme),
      demo: true,
      inputTokens: 0,
      speculative: {},
      elapsedMs: Date.now() - started,
    });
  }

  const apiKey = process.env.JEV_TOKEN!.trim();
  try {
    const plan = await editPlan(
      apiKey,
      prompt,
      present,
      theme,
      AbortSignal.timeout(30_000),
      variants,
      archetype,
    );
    return Response.json({ ...plan, elapsedMs: Date.now() - started });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
