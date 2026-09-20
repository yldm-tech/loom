import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHETYPES, SLOTS, SLOT_ORDER } from "@/lib/plan";
import { COMPONENT_SOURCES } from "@/lib/sources";
import { THEMES, themeVars } from "@/lib/themes";
import { TOOLS } from "@/lib/mcp";
import { buildLlmsTxt, EXPORTS } from "./llms";

/**
 * Two things can go wrong with a published llms.txt and neither one shows up in the app. The format can drift out of what llmstxt.org specifies, in which case a parser skips sections without saying so and the agent works from half a document. Or the content can go stale — a slot renamed, a source dropped, a seventh theme added — and then the document is worse than absent, because it reads as authoritative and is wrong. The structural tests cover the first, and the rest iterate the real tables so the second fails here instead of reaching whoever fetched it.
 */

const ORIGIN = "https://loom.example";
const doc = buildLlmsTxt(ORIGIN);
const lines = doc.split("\n");

const HEADING = /^#{1,6}\s/;
const H2 = /^##\s+(.+)$/;
/** The spec's link item: a markdown hyperlink, then optionally `:` and notes. */
const LINK_ITEM = /^- \[[^\]]+\]\((\S+)\)(: .+)?$/;

const h2Lines = lines.filter((line) => H2.test(line));
const firstH2 = lines.findIndex((line) => H2.test(line));
/** Every line from the first H2 onwards: the file-list half of the document. */
const sectionLines = lines.slice(firstH2);

/** Link targets, wherever they appear. */
function urls(text: string): string[] {
  return [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]!);
}

/** The document with every code span removed, so that a url quoted as `code` is not mistaken for one an agent can follow. */
function outsideCode(text: string): string {
  return text.replace(/`[^`]*`/g, "");
}

/**
 * The block list as the document prints it: slot in order, mapped to its variant ids.
 *
 * The archetype lines have the same `- `key`: ...` shape, so the detail half must be nothing but code spans and separators to match here; an archetype line says `always ` first and drops out.
 */
const blockList = new Map<string, string[]>(
  lines
    .map((line) => /^- `([a-z_]+)`: (`[a-z_]+`(?:, `[a-z_]+`)*)$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => [match[1]!, match[2]!.split(", ").map((id) => id.replaceAll("`", ""))]),
);

describe("buildLlmsTxt", () => {
  it("opens with exactly one H1, the only element llmstxt.org actually requires", () => {
    expect(lines[0]).toMatch(/^# \S/);
    expect(lines.filter((line) => /^# /.test(line))).toHaveLength(1);
  });

  it("puts no heading in the prose block, because a heading before the first H2 turns project notes into a file-list section a parser will try to read as links", () => {
    for (const line of lines.slice(1, firstH2)) {
      expect(HEADING.test(line), `heading inside the prose block: ${line}`).toBe(false);
    }
  });

  it("summarises in a blockquote directly under the H1, which is where the spec puts the one line an agent reads before deciding to keep reading", () => {
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(/^> \S/);
  });

  it("holds nothing but H2s, blanks and well-formed link items once the sections start, so a section never leaks prose a list parser would drop", () => {
    for (const line of sectionLines) {
      const ok = H2.test(line) || line === "" || LINK_ITEM.test(line);
      expect(ok, `not a heading, a blank or a link item: ${line}`).toBe(true);
    }
  });

  it("prints the block list as SLOT_ORDER itself, in order and with each slot's full variant set, so adding a block without touching lib/llms.ts fails here rather than shipping a document that omits it", () => {
    // Asserting the parsed list rather than `toContain` per name: every slot is also named in some archetype's required or optional list, so dropping one from the block list on its own leaves its name in the document and a containment check never notices.
    expect([...blockList.keys()]).toEqual(SLOT_ORDER);
    for (const slot of SLOT_ORDER) {
      expect(blockList.get(slot), `variants printed for ${slot}`).toEqual(
        Object.keys(SLOTS[slot].variants),
      );
    }
  });

  it("names every archetype, since the archetype decides which blocks a caller can expect at all", () => {
    for (const key of Object.keys(ARCHETYPES)) {
      expect(doc, `archetype ${key} is missing`).toContain(`\`${key}\``);
    }
  });

  it("names every theme key and every token themeVars emits, because a component rewritten onto a variable that does not exist renders in the wrong colours and reports no error", () => {
    for (const key of Object.keys(THEMES)) {
      expect(doc, `theme ${key} is missing`).toContain(`\`${key}\``);
    }
    for (const token of Object.keys(themeVars(Object.keys(THEMES)[0]!))) {
      expect(doc, `token ${token} is missing`).toContain(`\`${token}\``);
    }
  });

  it("prints no token values, keeping every hex literal in lib/themes.ts where the contrast test can still see it", () => {
    expect(doc).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it("names every component source with its install command and its endpoints, which is the whole reason an agent reads this instead of guessing", () => {
    for (const [key, source] of Object.entries(COMPONENT_SOURCES)) {
      expect(doc, `source ${key} is missing`).toContain(source.name);
      expect(doc, `${key}.url is missing`).toContain(source.url);
      if (source.install) expect(doc, `${key}.install is missing`).toContain(source.install);
      for (const endpoint of source.endpoints) {
        expect(doc, `${key} endpoint ${endpoint} is missing`).toContain(endpoint);
      }
    }
  });

  it("names loom's own MCP server and every tool on it, or the one document an agent fetches unattended hides the typed surface and the agent keeps re-parsing this prose for facts a tool would hand it", () => {
    // The first version of this file named beUI's MCP endpoint and not loom's, in the same commit that shipped lib/mcp.ts.
    const prose = lines.slice(1, firstH2).join("\n");
    expect(prose, "the MCP server is not named in the prose block").toContain("npm run mcp");
    for (const tool of TOOLS) {
      expect(prose, `MCP tool ${tool.name} is missing`).toContain(`\`${tool.name}\``);
    }
    // It has no url, so it can only live in the prose block: the sections below take link items only.
    expect(sectionLines.join("\n")).not.toContain("npm run mcp");
  });

  it("repeats the finding that no source ships a page section, the one claim in lib/sources.ts that an agent acting on this file must not be left to contradict", () => {
    expect(doc).toMatch(/no hero, no testimonial block, no team grid and no footer/);
  });

  it("builds every link from the origin it was handed, so a preview deployment never points agents at production", () => {
    const targets = urls(doc);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.startsWith(`${ORIGIN}/`), `${target} was not built from the origin`).toBe(true);
    }

    const elsewhere = buildLlmsTxt("https://other.test");
    expect(elsewhere).toBe(doc.replaceAll(ORIGIN, "https://other.test"));
    for (const target of urls(elsewhere)) expect(target).not.toContain(ORIGIN);
  });

  it("serves the same document whether or not the origin arrives with a trailing slash, since one doubled separator makes every link a 404", () => {
    expect(buildLlmsTxt(`${ORIGIN}/`)).toBe(doc);
    expect(doc).not.toContain(`${ORIGIN}//`);
  });

  it("quotes other people's endpoints as code rather than as links, so every url an agent can follow is one this origin answers", () => {
    const followable = outsideCode(doc).match(/https?:\/\/\S+/g) ?? [];
    for (const url of followable) {
      expect(url.startsWith(ORIGIN), `${url} is followable and off-origin`).toBe(true);
    }
    // The sources are still in the document — as code spans, which is what makes the assertion above mean something other than "no urls at all".
    expect(doc).toContain(COMPONENT_SOURCES.shadcn!.url);
  });

  it("puts `Optional` last among the H2s, because the name is defined as the section to skip under context pressure and a reader that stops early must not skip a real one", () => {
    const optional = h2Lines.findIndex((line) => /^##\s+Optional\s*$/.test(line));
    if (optional !== -1) expect(optional).toBe(h2Lines.length - 1);
  });

  it("lists exactly the downloads the editor offers, because this one list is the file's only hand-written copy", () => {
    // It went stale on its first opportunity: bundle.zip shipped and llms.ts still said five formats. A pure builder should not import a React component to recover six strings, so the duplicate stays and this reads the other copy instead.
    const source = readFileSync(join(import.meta.dirname, "..", "app", "page.tsx"), "utf8");
    const offered = [...source.matchAll(/a\.download = (?:"([^"]+)"|`([^`]+)`)/g)].map((match) =>
      (match[1] ?? match[2]!).replace(/\$\{[^}]+\}/g, "<theme>"),
    );

    expect(offered.length, "no download attributes found — the parser stopped matching app/page.tsx").toBeGreaterThanOrEqual(5);
    expect(EXPORTS.map((entry) => entry.file)).toEqual(offered);
    for (const file of offered) expect(doc, `${file} is offered by the editor but missing from llms.txt`).toContain(file);
  });

  it("emits a document with several sections and a filled prose block, so none of the checks above can pass against a stub", () => {
    expect(h2Lines.length).toBeGreaterThanOrEqual(3);
    expect(sectionLines.filter((line) => LINK_ITEM.test(line)).length).toBeGreaterThanOrEqual(4);
    expect(lines.slice(1, firstH2).filter((line) => line !== "").length).toBeGreaterThanOrEqual(20);
  });
});
