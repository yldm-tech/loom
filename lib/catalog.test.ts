import { describe, expect, it } from "vitest";
import { catalog, validateProps } from "./catalog";

/**
 * The catalog called itself the component contract and nothing enforced it.
 *
 * `catalog.validate()` checks that every element names a declared component and stops there: the spec below, whose `Pricing` carries the string `"免费"` where an array of tiers belongs, comes back `success: true` from it. That is the gap these tests stand in — the zod schemas were a description of what the model ought to send, and `validateProps` is what turns them into a check on what it did send.
 *
 * The case is not hypothetical. `isReady` gates on presence and non-blankness, and `"免费"` is present and not blank, so the block was declared ready and reached a renderer that writes `(props.tiers as ...).map` — a cast, not a check.
 */

const TIER = { name: "手冲", price: "38", period: "每杯", features: ["单一产区"], highlighted: true };
const PRICING = { title: "价目", cta: "来一杯", tiers: [TIER] };

describe("validateProps", () => {
  it("accepts props that satisfy the component's own schema, so the gate cannot be passing by refusing everything", () => {
    expect(validateProps("Pricing", PRICING)).toBeNull();
    expect(validateProps("Skeleton", { kind: "section" })).toBeNull();
    expect(validateProps("Page", { theme: "forest" })).toBeNull();
  });

  it("rejects a field of the wrong type, which is the whole reason it exists — isReady sees a non-blank string and calls it ready", () => {
    const problem = validateProps("Pricing", { ...PRICING, tiers: "免费" });
    expect(problem).not.toBeNull();
    expect(problem!.component).toBe("Pricing");
    expect(problem!.path).toBe("tiers");
    expect(problem!.expected).toMatch(/array/i);
  });

  it("is stricter than catalog.validate, which is the claim this module is built on", () => {
    // If this ever starts failing because catalog.validate grew prop checking, validateProps has become redundant and should be deleted rather than kept out of habit.
    const spec = {
      root: "root",
      state: {},
      elements: {
        root: { type: "Page", props: { theme: "forest" }, children: ["p"] },
        p: { type: "Pricing", props: { ...PRICING, tiers: "免费" }, children: [] },
      },
    };
    expect(catalog.validate(spec).success).toBe(true);
    expect(validateProps("Pricing", spec.elements.p.props)).not.toBeNull();
  });

  it("reports a nested path, so a log line says which field of which item was wrong", () => {
    const problem = validateProps("Pricing", { ...PRICING, tiers: [{ ...TIER, features: "单一产区" }] });
    expect(problem!.path).toBe("tiers.0.features");
  });

  it("rejects a missing required field rather than filling it in", () => {
    const { cta: _cta, ...withoutCta } = PRICING;
    expect(validateProps("Pricing", withoutCta)!.path).toBe("cta");
  });

  it("treats an inherited property name as no component at all, since the type can arrive from a model", () => {
    // `components["constructor"]` is a function on every plain object. Indexing would have handed a function's `.props` to safeParse.
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const problem = validateProps(name, {});
      expect(problem, `${name} resolved to something`).not.toBeNull();
      expect(problem!.expected).toMatch(/component/);
    }
  });

  it("covers every component the catalog declares, so a block added without a schema fails here rather than at render", () => {
    const names = catalog.componentNames;
    expect(names.length).toBeGreaterThanOrEqual(19);
    for (const name of names) {
      // Empty props satisfy no block in this catalog; what matters is that the lookup resolves and the schema runs rather than throwing.
      expect(() => validateProps(name, {})).not.toThrow();
    }
  });
});
