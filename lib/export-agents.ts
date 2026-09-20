import { SLOT_ORDER, type SlotKey } from "./plan";
import { sourcesFor, type ComponentSource } from "./sources";
import { THEMES, themeVars } from "./themes";

/**
 * The brief that ships beside the other exports.
 *
 * The other three hand over a page; this hands over the context needed to keep working on it. AGENTS.md is a real convention that specifies almost nothing beyond the filename, which is an open invitation to emit Setup Commands / Testing / PR Guidelines headings — ceremony that costs the receiving agent context and says nothing true here, because what loom exports is three files in a folder, not a repo with a test suite and a PR process.
 *
 * So every section below exists to head off one mistake an agent predictably makes: hand-editing the generated TSX and losing the work on the next export, pasting a component that carries its own palette, or going looking for a hero section in libraries that have never shipped one. Nothing else earns the space.
 *
 * The theme tokens are printed in full for that reason rather than described. An agent holding the seventeen values does not have to guess them, and rewriting a pasted component onto those variables is the whole difference between the lazy workflow working and a page wearing two colour schemes at once.
 */

/** A source shown in the table, with the page's own blocks it applies to. */
type Shown = { source: ComponentSource; slots: string[] };

/** Pipes would end the cell early, so the one character that can break a row is escaped rather than trusted not to appear. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function code(text: string): string {
  return `\`${text}\``;
}

function list(items: string[]): string {
  return items.map(code).join(", ");
}

/**
 * The sources worth showing, each carrying the blocks on this page it can improve.
 *
 * Grouping by source rather than printing one table per block keeps the brief short: five rows at most, and the blocks column tells the agent where each one applies. Order follows first appearance in page order, so the table reads top-down like the page does.
 */
function shownSources(slots: string[]): Shown[] {
  const shown = new Map<string, Shown>();
  for (const slot of slots) {
    // `slots` arrives as the page's own strings; one loom does not recognise simply matches no source.
    for (const source of sourcesFor(slot as SlotKey)) {
      const entry = shown.get(source.name);
      if (entry) entry.slots.push(slot);
      else shown.set(source.name, { source, slots: [slot] });
    }
  }
  return [...shown.values()];
}

function sourceTable(shown: Shown[]): string {
  const rows = shown.map(({ source, slots }) =>
    [
      `[${source.name}](${source.url})`,
      source.role,
      list(slots),
      source.install
        ? code(source.install)
        : "Browser only — nothing to run",
      cell(source.caveat),
    ].join(" | "),
  );
  return [
    "Source | Gives you | Blocks here it can improve | Install | What bites you",
    "--- | --- | --- | --- | ---",
    ...rows,
  ]
    .map((row) => `| ${row} |`)
    .join("\n");
}

function tokenBlock(theme: string): string {
  const declarations = Object.entries(themeVars(theme)).map(([name, value]) => `${name}: ${value};`);
  return ["```css", ...declarations, "```"].join("\n");
}

/**
 * The page's blocks in the order they are rendered.
 *
 * The caller's `slots` arrives in the order the blocks were planned and edited, which is not the order they appear on screen — code owns rendering order and keeps it in SLOT_ORDER. Telling an agent "in that order" while printing the planning order is a small lie that costs it a scroll to catch. A slot loom does not recognise sorts last rather than being dropped, because a brief that quietly omits a block is worse than one that lists it out of place.
 */
function inPageOrder(slots: string[]): string[] {
  const rank = (slot: string) => {
    const index = SLOT_ORDER.indexOf(slot as SlotKey);
    return index === -1 ? SLOT_ORDER.length : index;
  };
  return [...new Set(slots)].sort((a, b) => rank(a) - rank(b));
}

export function buildAgentsMd(root: Element, prompt: string, theme: string, slots: string[]): string {
  const present = inPageOrder(slots);
  const shown = shownSources(present);
  const uncovered = present.filter((slot) => sourcesFor(slot as SlotKey).length === 0);
  // themeVars falls back to forest for a name it does not know, so the prose names the theme actually printed. The HTML file is named after the string the export was given, whatever it was.
  const printed = theme in THEMES ? theme : "forest";
  const wrapper = root.tagName.toLowerCase();

  const licences = shown
    .filter(({ source }) => source.name !== "Transitions")
    .map(({ source }) => `${source.name} — ${source.license}`)
    .join(" · ");
  const transitions = shown.find(({ source }) => source.name === "Transitions");

  const sections = [
    `# AGENTS.md`,
    `This folder is one marketing page that loom generated from a single sentence: "${prompt.replace(/\s+/g, " ").trim()}". The notes below are the parts an agent cannot see by reading the markup. Not every agent picks this file up on its own — Claude Code looks for CLAUDE.md — so point yours at it if it has not been read.`,

    `## The files, and which one is authoritative`,
    [
      `- ${code("spec.json")} — the page as data, and the only file loom itself reads. Everything else here is generated from it.`,
      `- ${code("Site.tsx")} — one flat React component, generated. Editing it by hand works right up until the next export, which overwrites the file and takes the edits with it. If the page will be regenerated, change ${code("spec.json")} instead; if this folder is where the page ends its life, edit away.`,
      `- ${code(`site-${theme}.html`)} — the same page standalone, with the CSS rules it actually uses inlined. Also generated.`,
    ].join("\n"),

    `## The theme contract`,
    `Nothing in the markup names a colour, a radius or a typeface directly — every one of them reads a CSS custom property. These seventeen are the ${code(printed)} theme, set as an inline style on the outermost ${code(`<${wrapper}>`)}, and every block on the page sits inside that element.`,
    tokenBlock(printed),
    `A component pasted in from anywhere else arrives with a palette of its own: hex literals, or another design system's token names such as ${code("text-foreground")} that resolve to nothing here. It will ignore the theme until it is rewritten onto the variables above. That rewrite is the step this workflow skips most often, and skipping it puts two colour schemes on one page.`,

    `## The blocks on this page`,
    `${list(present)} — top to bottom, one block each.`,
    ...(uncovered.length > 0
      ? [
          `Nothing in the table below covers ${list(uncovered)}. ${uncovered.length === 1 ? "That block stays" : "Those blocks stay"} as loom rendered ${uncovered.length === 1 ? "it" : "them"} unless you write the replacement yourself.`,
        ]
      : []),

    `## Where to get better components`,
    `${code("primitives")} are unstyled, accessible building blocks; ${code("motion")} is animation applied to a block you already have; ${code("widgets")} are finished single-purpose components. Rows are filtered to the blocks this page actually has.`,
    sourceTable(shown),
    `These improve a block that is already here. None of them replaces one: there is no hero, no testimonial block, no team grid and no footer section anywhere in the set — they are primitives, motion and app-shaped widgets. An agent sent to find a landing page section in them will spend a long time and come back empty, so take the animation, the primitive or the widget and keep loom's layout around it.`,
    ...(licences ? [`Licences: ${licences}.`] : []),
    ...(transitions
      ? [
          `Transitions is the one to read twice — its licence: ${transitions.source.license}. A snippet used in a page you ship is fine; vendoring the collection into anything you redistribute is not.`,
        ]
      : []),
  ];

  return `${sections.join("\n\n")}\n`;
}
