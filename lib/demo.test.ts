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

  it("honours every edit its own placeholder suggests, in every language", () => {
    const everything = ["nav", "hero", "social", "pricing", "faq", "footer", "gallery"];
    for (const locale of UI_LOCALES) {
      const dict = JSON.parse(
        readFileSync(join(import.meta.dirname, "..", "locales", `${locale}.json`), "utf8"),
      ) as { editPlaceholder: string };

      const proposed = suggestions(dict.editPlaceholder);
      expect(proposed.length, `${locale} placeholder suggests nothing parseable`).toBeGreaterThan(0);

      for (const suggestion of proposed) {
        expect(
          replayEdit(suggestion, everything, "forest").action,
          `${locale} suggests "${suggestion}" but demo mode cannot do it`,
        ).not.toBe("unclear");
      }
    }
  });

  it("reads an instruction the same with or without its accents", () => {
    // People type "enjoue" and "precos" on keyboards that make the accent work.
    const present = ["nav", "hero", "pricing", "footer"];
    expect(replayEdit("rends-le plus enjoue", present, "forest").theme).toBe("coral");
    expect(replayEdit("tire os precos", present, "forest").slot).toBe("pricing");
    expect(replayEdit("mach es dunkler", present, "forest").theme).toBe("terminal");
  });
});
