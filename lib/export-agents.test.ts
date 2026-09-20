import { describe, expect, it } from "vitest";
import { SLOT_ORDER, type SlotKey } from "@/lib/plan";
import { COMPONENT_SOURCES, sourcesFor } from "@/lib/sources";
import { themeVars } from "@/lib/themes";
import { buildAgentsMd } from "./export-agents";

/**
 * The brief is only worth its lines if every line is load-bearing, so these check the four facts an agent acts on: which file it may edit, which variables it must write against, which blocks it has, and which sources are real. A wrong value here is worse than no file at all — it sends the agent off confidently in the wrong direction.
 */
/**
 * The two-level root the app actually exports.
 *
 * The first fixture here was a single themed `<div class="antialiased">`, which is a DOM shape the app never renders: every exporter is handed `previewRef.current?.firstElementChild`, the unstyled `<div data-loom="site">` wrapper, and `themeVars(...)` lands one level further down on the registry's Page div. A fixture that collapses the two makes the brief's claim about where the tokens live true by accident, which is how it stayed wrong. The style is set through the DOM rather than written into the markup because the token values are lib/themes.ts's to own, and because the font stacks contain double quotes that an inline `style="…"` attribute would swallow.
 */
function page(theme = "forest"): Element {
  const host = document.createElement("div");
  host.innerHTML = `<div data-loom="site"><div class="antialiased"><section>hero</section></div></div>`;
  const root = host.firstElementChild!;
  const themed = root.firstElementChild as HTMLElement;
  for (const [name, value] of Object.entries(themeVars(theme))) themed.style.setProperty(name, value);
  return root;
}

/** `team` is in here deliberately: it is the one slot no source in the table covers. */
const SLOTS = ["nav", "hero", "features", "team", "faq", "footer"];

const build = (theme = "forest", slots = SLOTS) =>
  buildAgentsMd(page(theme), "我开了家咖啡店", theme, slots);

/** Table rows only, with the header and the separator dropped. */
function rows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => cells[0] !== "Source" && cells[0] !== "---");
}

describe("buildAgentsMd", () => {
  it("names every block it was handed, so the agent's page and the brief's page are the same page", () => {
    const markdown = build();
    for (const slot of SLOTS) expect(markdown, `${slot} is missing from the brief`).toContain(`\`${slot}\``);
  });

  it("lists the blocks in render order rather than the order it was handed them, because the brief claims they read top to bottom", () => {
    // The caller passes the planning order, which is not the rendering order: `footer` is planned early in an edit session and always renders last. The first version printed the caller's order under the words "in that order".
    const markdown = build("forest", ["footer", "hero", "nav", "faq"]);
    const line = markdown.split("\n").find((l) => l.includes("top to bottom"))!;
    expect(line).toContain("`nav`, `hero`, `faq`, `footer`");

    const listed = [...line.matchAll(/`([a-z]+)`/g)].map((m) => m[1] as SlotKey);
    const ranks = listed.map((slot) => SLOT_ORDER.indexOf(slot));
    expect(ranks, "a slot was printed out of SLOT_ORDER").toEqual([...ranks].sort((a, b) => a - b));
  });

  it("keeps a slot it does not recognise, rather than silently dropping a block from the brief", () => {
    // The unknown slot goes first on the way in, so only sorting can put it last on the way out.
    const markdown = build("forest", ["not_a_slot", "footer", "nav"]);
    const line = markdown.split("\n").find((l) => l.includes("top to bottom"))!;
    expect(line).toContain("`not_a_slot`");
    expect(line.indexOf("`footer`")).toBeLessThan(line.indexOf("`not_a_slot`"));
  });

  it("keeps a block no source covers out of the table, so no row arrives with an empty cell", () => {
    const markdown = build();
    expect(sourcesFor("team")).toHaveLength(0);
    for (const cells of rows(markdown)) {
      expect(cells).toHaveLength(5);
      for (const cell of cells) expect(cell, `empty cell in row ${cells[0]}`).not.toBe("");
      expect(cells[2], "team reached the table despite having no source").not.toContain("`team`");
    }
    expect(markdown).toContain("Nothing in the table below covers `team`");
  });

  it("prints all seventeen tokens at the values the theme declares, so nothing has to be guessed", () => {
    const markdown = build("forest");
    const vars = themeVars("forest");
    expect(Object.keys(vars)).toHaveLength(17);
    for (const [name, value] of Object.entries(vars)) {
      expect(markdown, `${name} is missing or wrong`).toContain(`${name}: ${value};`);
    }
    // The prose counts them out loud, so a token added to lib/themes.ts without the sentence following it would have the brief telling the agent to look for one fewer than it prints.
    expect(markdown).toContain(`These ${Object.keys(vars).length} are the`);
  });

  it("names the element that declares the tokens rather than the export root, so a block pasted where the brief points inherits the theme instead of nothing", () => {
    // The brief used to call the export root the themed element. It is one level up from the truth, and an agent that believes it appends its section as a sibling of the themed div, outside the scope every `var(--accent)` resolves in.
    const root = page();
    const themed = root.firstElementChild as HTMLElement;
    expect(themed.style.getPropertyValue("--bg"), "fixture stopped modelling the app's two-level root").not.toBe("");
    expect((root as HTMLElement).style.getPropertyValue("--bg"), "fixture root declares the tokens, so this test would pass on the old bug").toBe("");

    const line = buildAgentsMd(root, "我开了家咖啡店", "forest", SLOTS)
      .split("\n")
      .find((l) => l.includes("set as an inline style on"))!;
    const target = line.match(/set as an inline style on `(<[^`]+>)`/)?.[1];
    expect(target).toBe(`<${themed.tagName.toLowerCase()} class="${themed.getAttribute("class")}">`);
    expect(line).toContain("one level inside the outermost");
  });

  it("tells a declaration apart from a var() reference, so an element that merely reads a token cannot be mistaken for the one that sets it", () => {
    // Almost every block in app/registry.tsx carries an inline `color: var(--muted)` or similar. Picking the first element with a style attribute would work only for as long as the themed div happens to come first in document order, and would send the brief — and the agent — at whichever block moved ahead of it.
    const host = document.createElement("div");
    host.innerHTML = `<div data-loom="site"><span style="color: var(--bg)">reads it</span><div class="antialiased"><section>hero</section></div></div>`;
    const root = host.firstElementChild!;
    const themed = root.lastElementChild as HTMLElement;
    for (const [name, value] of Object.entries(themeVars("forest"))) themed.style.setProperty(name, value);

    const line = buildAgentsMd(root, "我开了家咖啡店", "forest", SLOTS)
      .split("\n")
      .find((l) => l.includes("set as an inline style on"))!;
    expect(line.match(/set as an inline style on `(<[^`]+>)`/)?.[1]).toBe(`<div class="antialiased">`);
  });

  it("follows the theme it was given, so a retheme cannot leave the brief quoting the old palette", () => {
    const terminal = build("terminal");
    expect(terminal).toContain(`--accent: ${themeVars("terminal")["--accent"]};`);
    expect(terminal).not.toContain(`--accent: ${themeVars("forest")["--accent"]};`);
    expect(terminal).toContain("`terminal` theme");
  });

  it("offers no command for a source that has none, so nothing in the table fails when pasted", () => {
    const markdown = build();
    const byName = new Map(Object.values(COMPONENT_SOURCES).map((s) => [s.name, s]));
    for (const cells of rows(markdown)) {
      const name = cells[0]!.replace(/^\[|\].*$/g, "");
      const source = byName.get(name)!;
      const install = cells[3]!;
      if (source.install) expect(install).toBe(`\`${source.install}\``);
      else {
        expect(install).not.toContain("npx");
        expect(install).not.toContain("`");
        expect(install).toContain("Browser only");
      }
    }
  });

  it("carries the Transitions licence constraint through, because that one is a legal limit and not a caveat", () => {
    const markdown = build();
    expect(markdown).toContain(COMPONENT_SOURCES.transitions!.license);
    expect(markdown).toContain("vendoring the collection into anything you redistribute is not");
  });

  it("says once that the TSX is generated, so the agent does not spend an afternoon on a file the next export overwrites", () => {
    const markdown = build();
    expect(markdown).toContain("`spec.json` — the page as data");
    expect(markdown).toMatch(/`Site\.tsx`[^\n]*generated/);
    expect(markdown).toContain("overwrites the file");
  });

  it("states that the sources improve a block rather than replace one, so no time goes into hunting for a hero", () => {
    const markdown = build();
    expect(markdown).toContain("None of them replaces one");
    expect(markdown).toMatch(/no hero, no testimonial block, no team grid and no footer section/);
  });

  it("never hard-wraps a paragraph, so the prose survives any editor's own wrapping", () => {
    // A wrapped paragraph shows up as two adjacent prose lines. Tables, list items, headings and the token block all legitimately run line after line, so only plain prose is examined.
    const lines = build().split("\n");
    let inCode = false;
    let previousWasProse = false;
    for (const line of lines) {
      if (line.startsWith("```")) {
        inCode = !inCode;
        previousWasProse = false;
        continue;
      }
      const prose = !inCode && line.trim() !== "" && !/^[|#\-]/.test(line);
      expect(previousWasProse && prose, `hard-wrapped paragraph at: ${line.slice(0, 60)}`).toBe(false);
      previousWasProse = prose;
    }
  });

  it("builds a table with several rows from the fixture, so the checks above cannot pass on an empty document", () => {
    const markdown = build();
    const table = rows(markdown);
    expect(table.length).toBeGreaterThanOrEqual(3);
    // The fixture has to contain all three shapes the checks depend on, or they each assert nothing.
    expect(table.some((cells) => cells[3] === "Browser only — nothing to run")).toBe(true);
    expect(table.some((cells) => cells[0]!.includes("Transitions"))).toBe(true);
    expect(SLOTS.some((slot) => sourcesFor(slot as SlotKey).length === 0)).toBe(true);
    expect(markdown.split("\n").length).toBeLessThanOrEqual(70);
  });
});
