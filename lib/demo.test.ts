import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { replayEdit } from "./demo";
import { UI_LOCALES } from "./i18n";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

/**
 * The fixtures are the demo's entire credibility. If one is truncated or
 * hand-edited into something the real pipeline would never emit, the demo
 * starts lying about what the system does.
 */
describe("fixtures", () => {
  const names = readdirSync(FIXTURES).filter((f) => f.endsWith(".jsonl"));

  it("ships one per UI locale, so demo mode never falls back across languages", () => {
    expect(names.sort()).toEqual([...UI_LOCALES].map((l) => `${l}.jsonl`).sort());
  });

  for (const name of names) {
    describe(name, () => {
      const events = readFileSync(join(FIXTURES, name), "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as Record<string, unknown>);

      it("is a complete run, not a truncated one", () => {
        const last = events.at(-1)!;
        expect(last.type).toBe("complete");
        expect(last.stopReason).toBe("finish");
      });

      it("opens with a plan and a skeleton before any copy", () => {
        const kinds = events.map((e) => e.type);
        const plan = kinds.indexOf("plan");
        const frame = events.findIndex((e) => e.type === "partial" && e.phase === "frame");
        const content = kinds.indexOf("content");
        expect(plan).toBeGreaterThanOrEqual(0);
        expect(frame).toBeGreaterThan(plan);
        expect(content).toBeGreaterThan(frame);
      });

      it("has timestamps that only move forward", () => {
        const times = events
          .map((e) => e.elapsedMs)
          .filter((t): t is number => typeof t === "number");
        expect(times.length).toBeGreaterThan(0);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
      });

      it("ends with a spec whose blocks all resolved", () => {
        const spec = events.at(-1)!.spec as {
          root: string;
          elements: Record<string, { type: string; children?: string[] }>;
        };
        const children = spec.elements[spec.root]!.children ?? [];
        expect(children.length).toBeGreaterThan(3);
        for (const key of children) {
          expect(spec.elements[key], `${key} missing`).toBeDefined();
          // A skeleton left in the final frame means the run never finished.
          expect(spec.elements[key]!.type).not.toBe("Skeleton");
        }
      });

      it("carries no credentials", () => {
        const raw = readFileSync(join(FIXTURES, name), "utf8");
        expect(raw).not.toMatch(/\bapik[A-Za-z0-9]{10}/);
        expect(raw).not.toMatch(/\bsk-[A-Za-z0-9]{20}/);
        expect(raw).not.toMatch(/Bearer\s+\S{20}/);
      });
    });
  }
});

describe("replayEdit", () => {
  const present = ["nav", "hero", "social", "pricing", "faq", "footer"];

  it("removes a block the page actually has", () => {
    expect(replayEdit("不要定价了", present, "warm")).toMatchObject({
      action: "remove",
      slot: "pricing",
    });
  });

  it("adds a block the page lacks instead of removing it", () => {
    expect(replayEdit("加个常见问题", ["nav", "hero", "footer"], "warm")).toMatchObject({
      action: "add",
      slot: "faq",
    });
  });

  it("maps mood words onto themes", () => {
    expect(replayEdit("换个更活泼的配色", present, "warm").theme).toBe("coral");
    expect(replayEdit("make it dark", present, "warm").theme).toBe("terminal");
  });

  it("says unclear rather than inventing an outcome it cannot replay", () => {
    expect(replayEdit("帮我部署上线", present, "warm").action).toBe("unclear");
    expect(replayEdit("写一篇博客", present, "warm").action).toBe("unclear");
  });

  /**
   * The placeholder is a promise: it tells the reader, in their language, what
   * they can type. Demo mode is the default for anyone without keys, so a
   * suggestion it cannot honour is the first thing they try and the first thing
   * that does nothing. Four languages shipped that way — German, French,
   * Spanish and Portuguese, every suggestion dead — because the word list was
   * written when there were four locales and nothing tied the two together.
   */
  const suggestions = (placeholder: string) =>
    [...placeholder.matchAll(/[「『"“”«»„]\s*([^「』"“”«»„]+?)\s*[」』"“”«»]/g)]
      .map((m) => m[1]!.trim())
      .filter((s) => s.length > 2);

  const placeholderOf = (locale: string) =>
    (
      JSON.parse(
        readFileSync(join(import.meta.dirname, "..", "locales", `${locale}.json`), "utf8"),
      ) as { editPlaceholder: string }
    ).editPlaceholder;

  /** The blocks that locale's own recording ends up with — the page the demo user is looking at when they read the placeholder. */
  const fixtureSlots = (locale: string) =>
    readFileSync(join(FIXTURES, `${locale}.jsonl`), "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { type?: string; slots?: string[] })
      .filter((event) => event.type === "plan")
      .at(-1)!.slots!;

  it("recognises every edit its own placeholder suggests, in every language, so no suggestion is a phrase the word list has never heard of", () => {
    const everything = ["nav", "hero", "social", "pricing", "faq", "footer", "gallery"];
    for (const locale of UI_LOCALES) {
      const proposed = suggestions(placeholderOf(locale));
      expect(proposed.length, `${locale} placeholder suggests nothing parseable`).toBeGreaterThan(0);

      for (const suggestion of proposed) {
        expect(
          replayEdit(suggestion, everything, "forest").action,
          `${locale} suggests "${suggestion}" but demo mode cannot do it`,
        ).not.toBe("unclear");
      }
    }
  });

  /**
   * The test above measured a page no user has: a hand-written list with every slot in it. zh's recording has no pricing block, so 「不要定价了」 — the phrase zh's own placeholder proposes — matched the pricing words, failed the presence check and fell through to the catch-all. Driving each locale's suggestions against its own fixture is the only version of this test that measures what the reader sees.
   */
  it("answers every placeholder suggestion against the page that locale's own fixture records, so the catch-all is never what a suggested edit gets", () => {
    for (const locale of UI_LOCALES) {
      const slots = fixtureSlots(locale);
      for (const suggestion of suggestions(placeholderOf(locale))) {
        const outcome = replayEdit(suggestion, slots, "forest");
        const why = `${locale} suggests "${suggestion}" against [${slots.join(" ")}]`;
        expect(outcome.blockedBy ?? "", why).not.toContain("only replays a few recorded edits");
        if (outcome.action !== "unclear") continue;
        // The one refusal allowed is the honest one: this page does not have that block. Anything else means the suggestion silently did nothing.
        const named = /has no (\w+) block/.exec(outcome.blockedBy ?? "");
        expect(named, `${why} and was refused without naming a block`).not.toBeNull();
        expect(slots, why).not.toContain(named![1]);
      }
    }
  });

  it("names the block a page lacks instead of adding it, so a request to drop something absent is not answered by putting it on the page", () => {
    const zh = fixtureSlots("zh");
    expect(zh, "the zh fixture used to have no pricing block, which is what this guards").not.toContain("pricing");
    const outcome = replayEdit("不要定价了", zh, "forest");
    expect(outcome.action).toBe("unclear");
    expect(outcome.blockedBy).toContain("has no pricing block");
  });

  it("refuses to restyle a block the page does not have, so the presence rule covers every branch and not only the ones a fixture happens to exercise", () => {
    expect(replayEdit("换个导航栏样式", ["hero", "footer"], "forest")).toMatchObject({
      action: "unclear",
      blockedBy: expect.stringContaining("has no nav block"),
    });
  });

  it("still adds a block the page lacks when nothing in the request says to take one away, so 加个 keeps working", () => {
    expect(replayEdit("加个价格表", ["nav", "hero", "footer"], "forest")).toMatchObject({
      action: "add",
      slot: "pricing",
    });
  });

  it("reads an instruction the same with or without its accents", () => {
    // People type "enjoue" and "precos" on keyboards that make the accent work.
    const present = ["nav", "hero", "pricing", "footer"];
    expect(replayEdit("rends-le plus enjoue", present, "forest").theme).toBe("coral");
    expect(replayEdit("tire os precos", present, "forest").slot).toBe("pricing");
    expect(replayEdit("mach es dunkler", present, "forest").theme).toBe("terminal");
  });
});
