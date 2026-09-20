import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Replay mode for people who have not set up keys yet.
 *
 * The fixtures under `fixtures/` are real recorded runs, streamed back with
 * their original timing so the skeleton-then-fill behaviour looks the way it
 * actually does. Nothing here is hand-authored — a demo that flatters the
 * system by showing something it does not really produce is worse than no demo.
 */

const FIXTURES = join(process.cwd(), "fixtures");

/** Demo mode is on exactly when the real thing cannot run. */
export function isDemoMode(): boolean {
  return !process.env.JEV_TOKEN?.trim() || !process.env.LLM_TOKEN?.trim();
}

export async function availableFixtures(): Promise<string[]> {
  try {
    const files = await readdir(FIXTURES);
    return files.filter((f) => f.endsWith(".jsonl")).map((f) => f.replace(/\.jsonl$/, ""));
  } catch {
    return [];
  }
}

/**
 * The editor's own locale is the best signal, because Latin-script languages
 * are indistinguishable from the request text alone. It is only a hint, so a
 * locale with no recording still falls back to the script heuristic.
 */
function pickFixture(prompt: string, available: string[], locale?: string): string {
  if (locale && available.includes(locale)) return locale;

  const has = (re: RegExp) => re.test(prompt);
  const order = has(/[가-힯]/)
    ? ["ko", "en", "zh"]
    : has(/[぀-ヿ]/)
      ? ["ja", "en", "zh"]
      : has(/[一-龥]/)
        ? ["zh", "en"]
        : ["en", "zh"];
  return order.find((name) => available.includes(name)) ?? available[0]!;
}

export type DemoEvent = Record<string, unknown> & { elapsedMs?: number };

/**
 * Yields the recorded events, waiting out the gaps between them so the stream
 * arrives at roughly its original pace. Capped so a slow recording does not
 * make the demo feel broken.
 */
export async function* replay(
  prompt: string,
  signal: AbortSignal,
  locale?: string,
): AsyncGenerator<DemoEvent> {
  const available = await availableFixtures();
  if (available.length === 0) {
    yield {
      type: "error",
      message:
        "Demo mode has no fixtures to replay. Set JEV_TOKEN and LLM_TOKEN in .env.local to run for real.",
    };
    return;
  }

  const name = pickFixture(prompt, available, locale);
  const raw = await readFile(join(FIXTURES, `${name}.jsonl`), "utf8");
  const events = raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as DemoEvent);

  let previous = 0;
  for (const event of events) {
    const at = typeof event.elapsedMs === "number" ? event.elapsedMs : previous;
    const gap = Math.max(0, Math.min(at - previous, 4000));
    previous = at;
    if (gap > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, gap);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }
    if (signal.aborted) return;
    yield { ...event, demo: true, fixture: name };
  }
}

/**
 * Canned edit outcomes, keyed by what the recorded intents actually were. Only
 * the shapes the UI can apply without a model are covered; anything else is
 * reported as unavailable rather than faked.
 */
export function replayEdit(prompt: string, present: string[], theme: string) {
  const lower = prompt.toLowerCase();
  const match = (...needles: string[]) => needles.some((n) => lower.includes(n));

  const removable = (slot: string) => present.includes(slot);

  if (match("定价", "价格", "料金", "가격", "pricing", "price") && removable("pricing")) {
    return { action: "remove", slot: "pricing", confidence: 1, targetConfidence: 1 };
  }
  if (match("faq", "常见问题", "よくある", "자주")) {
    return removable("faq")
      ? { action: "remove", slot: "faq", confidence: 1, targetConfidence: 1 }
      : { action: "add", slot: "faq", confidence: 1, targetConfidence: 1 };
  }
  if (match("活泼", "明るく", "발랄", "playful", "bright")) {
    return { action: "theme", theme: "coral", confidence: 1, targetConfidence: 1 };
  }
  if (match("素", "地味", "차분", "minimal", "plain", "quiet")) {
    return { action: "theme", theme: "ink", confidence: 1, targetConfidence: 0.94 };
  }
  if (match("深色", "暗", "어둡", "dark")) {
    return { action: "theme", theme: "terminal", confidence: 1, targetConfidence: 0.9 };
  }
  if (match("nav", "导航", "内비", "내비", "ナビ")) {
    return {
      action: "restyle",
      slot: "nav",
      variant: "nav_centered",
      arbitrary: true,
      confidence: 1,
      targetConfidence: 0.34,
      blockedBy: "demo: recorded outcome",
    };
  }
  return {
    action: "unclear",
    confidence: 1,
    targetConfidence: 0,
    blockedBy: `demo mode only replays a few recorded edits; theme is ${theme}`,
  };
}
