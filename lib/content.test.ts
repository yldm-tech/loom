import { describe, expect, it } from "vitest";
import { validateProps } from "./catalog";
import { elementsFor } from "./content";
import { SLOTS } from "./plan";

/**
 * Element recipes must not repair what the model sent.
 *
 * `elementsFor` builds every variant's props eagerly, so a wrong-typed field has to be kept away from the one operation that would throw on it — `tiers.slice(0, 1).map(...)`. The obvious way to do that is to substitute an empty array, and that is what this function used to do. It stops the crash and it defeats the check: an empty array is a legal `tiers`, so the block satisfies its catalog schema, renders, and shows a price section with a heading, a button and no prices.
 *
 * The rule these tests hold in place is narrow: guard the operation, not the payload. What reaches the props is what the model sent, so the layer that knows what a tier list looks like can see that this is not one.
 */

const CONTENT = {
  pricingTitle: "价目",
  pricingCta: "来一杯",
  tiers: [{ name: "手冲", price: "38", period: "每杯", features: ["单一产区"], highlighted: false }],
};

describe("elementsFor", () => {
  it("hands every pricing variant the value it was given rather than an empty array standing in for it", () => {
    // Both variants, by name from SLOTS rather than by hand, because the substitution was removed from one of them first and the other kept it.
    for (const variant of Object.keys(SLOTS.pricing.variants)) {
      const element = elementsFor({ ...CONTENT, tiers: "免费" } as never)[variant as "pricing_multi"];
      expect(element.props.tiers, `${variant} replaced the model's answer`).toBe("免费");
      expect(validateProps(element.type, element.props), `${variant} passed the contract check`).not.toBeNull();
    }
  });

  it("still builds both pricing variants without throwing on that value, which is why the guard exists at all", () => {
    // The crash this protects against destroyed pages that had no pricing block: every variant's props are built whether or not its slot was chosen.
    expect(() => elementsFor({ ...CONTENT, tiers: "免费" } as never)).not.toThrow();
    expect(() => elementsFor({ ...CONTENT, tiers: null } as never)).not.toThrow();
    expect(() => elementsFor({} as never)).not.toThrow();
  });

  it("builds valid props from valid copy, so the checks above are not passing by rejecting everything", () => {
    const elements = elementsFor(CONTENT as never);
    for (const variant of Object.keys(SLOTS.pricing.variants)) {
      const element = elements[variant as "pricing_multi"];
      expect(validateProps(element.type, element.props), `${variant} rejected good copy`).toBeNull();
    }
    expect(elements.pricing_single.props.tiers).toHaveLength(1);
    expect((elements.pricing_single.props.tiers as { highlighted: boolean }[])[0]!.highlighted).toBe(true);
  });
});
