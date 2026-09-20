import { editPlan } from "@/lib/edit";
import type { SlotKey } from "@/lib/plan";

export const maxDuration = 60;

export async function POST(request: Request) {
  const apiKey = process.env.JEV_TOKEN?.trim();
  if (!apiKey) {
    return Response.json({ error: "JEV_TOKEN is not set" }, { status: 500 });
  }

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
