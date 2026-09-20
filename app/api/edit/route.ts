import { editPlan } from "@/lib/edit";
import { isDemoMode, replayEdit } from "@/lib/demo";
import type { SlotKey } from "@/lib/plan";

export const maxDuration = 60;

export async function POST(request: Request) {
  const { prompt, present, theme, variants } = (await request.json()) as {
    prompt?: string;
    present?: SlotKey[];
    theme?: string;
    variants?: Partial<Record<SlotKey, string>>;
  };
  if (!prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const started = Date.now();
  if (isDemoMode()) {
    return Response.json({
      ...replayEdit(prompt, present ?? [], theme ?? "forest"),
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
      present ?? [],
      theme ?? "forest",
      AbortSignal.timeout(30_000),
      variants ?? {},
    );
    return Response.json({ ...plan, elapsedMs: Date.now() - started });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
