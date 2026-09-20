import { describe, expect, it } from "vitest";
import { asSettled, isReady, SLOT_NEEDS } from "./content-parallel";
import { SLOTS } from "./plan";
import type { SiteContent } from "./content";

describe("isReady", () => {
  it("holds a block back until every field it renders has arrived", () => {
    expect(isReady("nav_standard", { brand: "某某" })).toBe(false);
    expect(
      isReady("nav_standard", {
        brand: "某某",
        navLinks: ["一", "二"],
        primaryCta: "了解",
      } as Partial<SiteContent>),
    ).toBe(true);
  });

  it("treats an empty array as missing, not as present", () => {
    expect(
      isReady("nav_standard", {
        brand: "某某",
        navLinks: [],
        primaryCta: "了解",
      } as Partial<SiteContent>),
    ).toBe(false);
  });

  it("lets the minimal nav through without links, because it renders none", () => {
    expect(isReady("nav_minimal", { brand: "某某", primaryCta: "了解" })).toBe(true);
  });

  it("refuses a variant it knows nothing about", () => {
    expect(isReady("nav_does_not_exist", { brand: "某某" })).toBe(false);
  });

  it("declares needs for every variant a slot can resolve to", () => {
    for (const [name, slot] of Object.entries(SLOTS)) {
      for (const variant of Object.keys(slot.variants)) {
        expect(SLOT_NEEDS[variant], `${name} → ${variant} has no declared needs`).toBeDefined();
      }
    }
  });
});

describe("asSettled", () => {
  it("yields in completion order, not call order", async () => {
    const delayed = <T>(value: T, ms: number) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

    const seen: string[] = [];
    for await (const value of asSettled([
      delayed("slow", 40),
      delayed("fast", 5),
      delayed("middle", 20),
    ])) {
      seen.push(value);
    }
    expect(seen).toEqual(["fast", "middle", "slow"]);
  });

  it("drains everything exactly once", async () => {
    const values: number[] = [];
    for await (const value of asSettled([1, 2, 3, 4].map((n) => Promise.resolve(n)))) {
      values.push(value);
    }
    expect([...values].sort()).toEqual([1, 2, 3, 4]);
  });

  it("ends immediately when given nothing to wait for", async () => {
    const values: unknown[] = [];
    for await (const value of asSettled([])) values.push(value);
    expect(values).toEqual([]);
  });
});
