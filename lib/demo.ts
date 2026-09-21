import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { scriptOf } from "./plan";

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

  const script = scriptOf(prompt);
  const order =
    script === "hangul"
      ? ["ko", "en", "zh"]
      : script === "kana"
        ? ["ja", "en", "zh"]
        : script === "han"
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
 *
 * Matching is a word list because demo mode has no keys and so cannot ask Jev,
 * which is the layer that actually understands a request. That makes the list
 * the one place where adding a UI language can silently break something: the
 * four languages added after this was written left German, French, Spanish and
 * Portuguese users watching every suggestion in their own placeholder do
 * nothing. A test now feeds each locale's `editPlaceholder` suggestions back
 * through here, so the app cannot propose an edit it will not honour.
 *
 * That test measured the wrong page, though, and the same class of bug survived it: it handed every suggestion a synthetic block list containing every slot, while fixtures/zh.jsonl — the recording a Chinese-locale visitor actually gets — has no pricing block. So zh's own placeholder, 「不要定价了」, fell past every branch to the catch-all and the page did not move. The test now drives each locale's suggestions against the slots that locale's fixture really produces.
 */

/** Written without diacritics, and compared against input stripped the same way. */
const EDIT_WORDS = {
  pricing: ["定价", "价格", "料金", "가격", "pricing", "price", "preise", "tarif", "prix", "precio", "preco"],
  faq: ["faq", "常见问题", "よくある", "자주", "haufige fragen", "questions frequentes", "preguntas frecuentes", "perguntas frequentes"],
  playful: ["活泼", "明るく", "발랄", "playful", "bright", "lebendig", "lebhaft", "enjou", "desenfadado", "alegre", "animado"],
  // "sobre" is the natural French word here and a very common Portuguese and
  // Spanish preposition, so it is left out in favour of unambiguous ones.
  minimal: ["素", "地味", "차분", "minimal", "plain", "quiet", "schlicht", "epure", "sobrio"],
  // German drops the e when it inflects: dunkel becomes dunkler, dunkles.
  dark: ["深色", "暗", "어둡", "dark", "dunkel", "dunkl", "sombre", "oscuro", "escuro"],
  nav: ["nav", "导航", "내비", "ナビ"],
} as const;

/**
 * Words that mean "take it away". The groups above name a block but not a direction, and presence decided it for them: the block is on the page so remove it, it is not so add it. That inverts the request when someone asks to drop a block their page never had, which is exactly what the zh placeholder suggests against the zh fixture. Direction is only consulted when the block is absent — when it is on the page presence still decides, so nothing here can turn a removal into something else.
 *
 * Kept to stems long enough to survive substring matching: "no" and "sin" occur inside ordinary words, so the removal phrasing each locale's placeholder actually uses is listed instead.
 */
const REMOVE_WORDS = [
  "不要", "去掉", "删", "取消", "いらない", "削除", "빼", "삭제", "없애",
  "drop", "remove", "delete", "without", "get rid",
  "weglassen", "entfernen", "loschen", "ohne",
  "enleve", "retire", "supprime", "sans",
  "quita", "elimina", "tire", "remova", "retira",
] as const;

/** "enjoué" and "enjoue" are the same instruction; so are "preços" and "precos". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** The same fields lib/edit.ts reports, declared rather than inferred: a branch that returns through a helper otherwise narrows the union and the callers lose `theme` and `slot`. */
export type DemoEdit = {
  action: string;
  confidence: number;
  targetConfidence: number;
  slot?: string;
  theme?: string;
  variant?: string;
  arbitrary?: boolean;
  blockedBy?: string;
};

export function replayEdit(prompt: string, present: string[], theme: string): DemoEdit {
  const folded = fold(prompt);
  const match = (group: keyof typeof EDIT_WORDS) =>
    EDIT_WORDS[group].some((word) => folded.includes(fold(word)));

  const onPage = (slot: string) => present.includes(slot);
  const wantsRemoval = REMOVE_WORDS.some((word) => folded.includes(fold(word)));

  // When the request names a block this page does not have, say so. Forcing it into the nearest edit the word list can perform would mean answering 「不要定价了」 by adding a pricing section, and the live path does not do that: Jev scores remove_target over the blocks that exist, lands under the floor and reports unclear. A demo that shows an outcome the real system would never produce is the thing this module exists not to do.
  const notOnPage = (slot: string): DemoEdit => ({
    action: "unclear",
    confidence: 1,
    targetConfidence: 0,
    blockedBy: `this page has no ${slot} block, so there is nothing to change there`,
  });
  const addOrExplain = (slot: string): DemoEdit =>
    wantsRemoval
      ? notOnPage(slot)
      : { action: "add", slot, confidence: 1, targetConfidence: 1 };

  if (match("pricing")) {
    return onPage("pricing")
      ? { action: "remove", slot: "pricing", confidence: 1, targetConfidence: 1 }
      : addOrExplain("pricing");
  }
  if (match("faq")) {
    return onPage("faq")
      ? { action: "remove", slot: "faq", confidence: 1, targetConfidence: 1 }
      : addOrExplain("faq");
  }
  if (match("playful")) {
    return { action: "theme", theme: "coral", confidence: 1, targetConfidence: 1 };
  }
  if (match("minimal")) {
    return { action: "theme", theme: "ink", confidence: 1, targetConfidence: 0.94 };
  }
  if (match("dark")) {
    return { action: "theme", theme: "terminal", confidence: 1, targetConfidence: 0.9 };
  }
  if (match("nav")) {
    if (!onPage("nav")) return notOnPage("nav");
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
