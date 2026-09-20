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
});
