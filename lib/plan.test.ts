import { describe, expect, it } from "vitest";
import { ARCHETYPES, SLOTS, SLOT_ORDER, layoutRules, type SlotKey } from "./plan";

/**
 * These rules are the part of the system that must never drift: they are what
 * a low-confidence judgement was replaced with, so a regression here quietly
 * hands the decision back to a model that cannot make it.
 */
describe("layoutRules", () => {
  it("uses a grid once there are enough selling points to scan", () => {
    const [rule] = layoutRules({ features: new Array(5).fill({}) });
    expect(rule?.slot).toBe("features");
    expect(rule?.id).toBe("features_grid");
  });

  it("uses a list when there are few points that need explaining", () => {
    const [rule] = layoutRules({ features: new Array(4).fill({}) });
    expect(rule?.id).toBe("features_list");
  });

  it("does not decide a slot the copy has not reached yet", () => {
    expect(layoutRules({})).toEqual([]);
    expect(layoutRules({ features: [] })).toEqual([]);
  });

  it("counts nothing from a field that is not a list, because a string's length is not an answer to how many", () => {
    // `"tiers": "免费"` is what the model sends when asked to price a free project. It is valid JSON, so no retry fires; it is two characters long, so reading `.length` off it elected the three-column comparison layout for a business with no tiers at all. The rule exists to count things, and a value that cannot be counted is not a small count — it is no answer.
    expect(layoutRules({ tiers: "免费" })).toEqual([]);
    expect(layoutRules({ features: "当日烘焙、单一产区、自带杯" })).toEqual([]);
    expect(layoutRules({ tiers: 3 })).toEqual([]);
    expect(layoutRules({ tiers: { basic: {}, pro: {} } })).toEqual([]);
    expect(layoutRules({ visualKind: 1 })).toEqual([]);
  });

  it("shows one price card for a single way to buy, a comparison for several", () => {
    expect(layoutRules({ tiers: [{}] })[0]?.id).toBe("pricing_single");
    expect(layoutRules({ tiers: [{}, {}] })[0]?.id).toBe("pricing_multi");
    expect(layoutRules({ tiers: [{}, {}, {}] })[0]?.id).toBe("pricing_multi");
  });

  it("only splits the hero when there is an interface to put in it", () => {
    expect(layoutRules({ visualKind: "interface" })[0]?.id).toBe("hero_split");
    for (const kind of ["product", "scene", "none"]) {
      expect(layoutRules({ visualKind: kind })[0]?.id).toBe("hero_centered");
    }
  });

  it("explains itself, because a rule nobody can read is a rule nobody trusts", () => {
    const [rule] = layoutRules({ features: new Array(6).fill({}) });
    expect(rule?.because).toContain("6");
  });
});

describe("archetypes", () => {
  it("never lets a model drop a block the page type requires", () => {
    expect(ARCHETYPES.landing.required).toContain("hero");
    expect(ARCHETYPES.local.required).toContain("contact");
    expect(ARCHETYPES.pricing.required).toContain("pricing");
  });

  it("keeps required and optional slots disjoint", () => {
    for (const [name, archetype] of Object.entries(ARCHETYPES)) {
      const required = new Set<string>(archetype.required);
      const overlap = archetype.optional.filter((slot) => required.has(slot));
      expect(overlap, `${name} lists the same slot twice`).toEqual([]);
    }
  });

  it("only references slots that exist", () => {
    const known = new Set(Object.keys(SLOTS));
    for (const [name, archetype] of Object.entries(ARCHETYPES)) {
      for (const slot of [...archetype.required, ...archetype.optional]) {
        expect(known.has(slot), `${name} references unknown slot ${slot}`).toBe(true);
      }
    }
  });
});

describe("slot order", () => {
  it("covers every slot exactly once, so nothing can be silently dropped", () => {
    const slots = Object.keys(SLOTS) as SlotKey[];
    expect([...SLOT_ORDER].sort()).toEqual([...slots].sort());
    expect(new Set(SLOT_ORDER).size).toBe(SLOT_ORDER.length);
  });

  it("puts chrome at the edges and content in between", () => {
    expect(SLOT_ORDER[0]).toBe("nav");
    expect(SLOT_ORDER[1]).toBe("hero");
    expect(SLOT_ORDER.at(-1)).toBe("footer");
  });
});

describe("auto slots", () => {
  it("marks exactly the slots whose variant a code rule decides", () => {
    const auto = Object.entries(SLOTS)
      .filter(([, slot]) => (slot as { auto?: boolean }).auto)
      .map(([name]) => name)
      .sort();
    expect(auto).toEqual(["features", "hero", "pricing"]);
  });

  it("keeps a real choice behind every auto slot, so an explicit request can override it", () => {
    for (const name of ["features", "hero", "pricing"] as SlotKey[]) {
      expect(Object.keys(SLOTS[name].variants).length).toBeGreaterThan(1);
    }
  });
});
