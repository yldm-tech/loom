import { describe, expect, it } from "vitest";
import { COMPONENT_SOURCES, sourcesFor } from "./sources";
import { SLOTS, SLOT_ORDER, type SlotKey } from "@/lib/plan";

/**
 * A hand-curated table rots without making a sound. Nothing in the app breaks when a `blocks` entry names a slot that was renamed two months ago, when two rows drift onto the same url, or when a source loses the one caveat that stopped an agent pasting licensed CSS into a redistributed build — the page still renders, and the wrong row just gets handed to whoever asked where to find components. These tests are the only thing that notices.
 *
 * `npm run sources` covers the other half, the half that needs the network: whether the endpoints still answer. Everything checkable offline is checked here.
 */

const KNOWN_SLOTS = new Set<string>(Object.keys(SLOTS));

/** The slot no source in the table covers today. Asserted by name below so that adding coverage forces the prose to be updated with it. */
const UNCOVERED_SLOT: SlotKey = "team";

describe("the source table", () => {
  it("lists exactly the five sources it was researched from, so a dropped row cannot pass as a deliberate prune", () => {
    expect(Object.keys(COMPONENT_SOURCES).sort()).toEqual(["beautifului", "beui", "rareui", "shadcn", "transitions"]);
  });

  it("names only real slots in `blocks`, so renaming a slot fails here instead of shipping a dead row to an agent", () => {
    for (const [key, source] of Object.entries(COMPONENT_SOURCES)) {
      for (const slot of source.blocks) {
        expect(KNOWN_SLOTS.has(slot), `${key} claims unknown slot ${slot}`).toBe(true);
      }
      expect(source.blocks.length, `${key} improves no slot, so nothing would ever point at it`).toBeGreaterThan(0);
      expect(new Set(source.blocks).size, `${key} lists the same slot twice`).toBe(source.blocks.length);
    }
  });

  it("gives every source its own url, because two rows for one site means one of them is stale", () => {
    const urls = Object.values(COMPONENT_SOURCES).map((source) => source.url);
    expect(new Set(urls).size).toBe(urls.length);

    const endpoints = Object.values(COMPONENT_SOURCES).flatMap((source) => source.endpoints);
    expect(new Set(endpoints).size, "the same endpoint is checked twice").toBe(endpoints.length);
  });

  it("leaves no field blank, since a half-filled row reads as researched when it is not", () => {
    for (const [key, source] of Object.entries(COMPONENT_SOURCES)) {
      for (const field of ["name", "url", "role", "summary", "license"] as const) {
        expect(source[field].trim(), `${key}.${field} is empty`).not.toBe("");
      }
      // `install` is legitimately null when the browser is the only way in, but an empty string would mean "run nothing" and silently succeed.
      expect(source.install === null || source.install.trim() !== "", `${key}.install is an empty command`).toBe(true);
      for (const endpoint of source.endpoints) {
        expect(endpoint.trim(), `${key} has a blank endpoint`).not.toBe("");
      }
    }
  });

  it("states a caveat for every source, which is the field that keeps the table honest rather than promotional", () => {
    for (const [key, source] of Object.entries(COMPONENT_SOURCES)) {
      expect(source.caveat.trim(), `${key} has no caveat, which is worse than having no entry`).not.toBe("");
    }
  });

  it("reaches every url and endpoint over https, because an agent fetches these unattended", () => {
    for (const [key, source] of Object.entries(COMPONENT_SOURCES)) {
      expect(source.url.startsWith("https://"), `${key}.url is not https`).toBe(true);
      for (const endpoint of source.endpoints) {
        expect(endpoint.startsWith("https://"), `${key} endpoint ${endpoint} is not https`).toBe(true);
      }
    }
  });

  it("declares no endpoints for a source with no install command, so browser-only really means no machine surface", () => {
    const browserOnly = Object.entries(COMPONENT_SOURCES).filter(([, source]) => source.install === null);
    expect(browserOnly.length, "nothing is browser-only any more, so the implication no longer has anything to protect").toBeGreaterThan(0);
    for (const [key, source] of browserOnly) {
      expect(source.endpoints, `${key} has no install command yet lists endpoints; one of the two is wrong`).toEqual([]);
    }
  });
});

describe("sourcesFor", () => {
  it("returns only sources that actually list the slot, so a recommendation is never invented", () => {
    for (const slot of SLOT_ORDER) {
      for (const source of sourcesFor(slot)) {
        expect(source.blocks, `${source.name} was returned for ${slot} without listing it`).toContain(slot);
      }
    }
  });

  it("puts the most machine-readable source first, because an agent can install from it unattended", () => {
    for (const slot of SLOT_ORDER) {
      const counts = sourcesFor(slot).map((source) => source.endpoints.length);
      expect(counts, `${slot} is ordered so an agent meets a browser-only source first`).toEqual([...counts].sort((a, b) => b - a));
    }
  });

  it("returns nothing for the team slot, the one kind of section none of the five ships", () => {
    expect(sourcesFor(UNCOVERED_SLOT), "a source now covers team: say so in lib/sources.ts and in the docs before changing this test").toEqual([]);
  });

  it("covers every other slot, so the table is worth consulting at all", () => {
    const uncovered = SLOT_ORDER.filter((slot) => sourcesFor(slot).length === 0);
    expect(uncovered).toEqual([UNCOVERED_SLOT]);
  });
});
