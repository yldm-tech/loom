import { MAX_REQUEST_CHARS } from "./edit";
import { TOOLS } from "./mcp";
import { ARCHETYPES, SLOTS, SLOT_ORDER, type SlotKey } from "./plan";
import { COMPONENT_SOURCES } from "./sources";
import { THEMES, themeVars } from "./themes";

/**
 * loom's own llms.txt.
 *
 * lib/sources.ts ranks five component libraries by how much of each one a machine can reach unattended — three publish an llms.txt, one runs an MCP server, three install from a CLI. Everything loom knows about its own blocks, themes and exports was reachable only by a person clicking buttons in a browser, which put loom last on the list it wrote. This is the cheapest of those surfaces to hand back, and it costs one route.
 *
 * Every name and count below is computed from the modules the app runs on. A block list typed out by hand keeps reading as authoritative for months after it stopped being true, and this document is aimed squarely at readers who cannot tell — adding a slot, a theme or a source is meant to change the output with no edit here, and lib/llms.test.ts iterates the real tables so that a stale copy fails rather than ships.
 *
 * The structure follows llmstxt.org literally: an H1, a blockquote, prose that may contain no heading at all, then H2 sections whose every line is a `- [title](url): details` link item. That last rule is why the blocks, themes, tokens, exports, sources and the MCP server are prose rather than sections of their own — none of them has a URL, and inventing `/docs/blocks` to satisfy the shape would send an agent to a 404. The only links here are paths this origin actually answers; other people's endpoints appear as code spans, so nothing an agent might follow points off the deployment it fetched this from.
 *
 * The MCP server was missing from this document for its whole first life, which made the document argue against itself: lib/llms.ts and lib/mcp.ts shipped in the same commit, and the only string containing "mcp" in the generated output was beUI's endpoint — loom advertised somebody else's MCP server and not its own. llms.txt exists so an agent can find what is reachable unattended, and a stdio server started by one command is exactly that. It has no URL, so it is a code span in the prose block rather than a link item, and the tool names are read out of `TOOLS` so the list cannot go stale the way the export list did.
 *
 * The export filenames are the one list stated rather than derived. They live as `download` attributes inside a React component, and reaching into the browser layer from a pure builder to recover them would trade a real duplicate for a worse coupling. It stayed stale for exactly one commit: `bundle.zip` shipped and this list still said five, which is the failure the rest of the file is built to avoid. So the test reads the `download` attributes straight out of app/page.tsx and fails when the two disagree — the list is written twice and checked once, rather than trusted.
 */

/** The downloads offered after a page is generated. See the note above on why this list is stated here and checked against app/page.tsx by the test. */
export const EXPORTS: { file: string; detail: string }[] = [
  {
    file: "site-<theme>.html",
    detail: "the rendered page standalone, carrying only the CSS rules its own markup matches",
  },
  {
    file: "Site.tsx",
    detail:
      "one flat React component, no import beyond a type from react, verified by a real `tsc --noEmit --strict` run",
  },
  {
    file: "spec.json",
    detail: "the page as data, and the only one of them loom itself reads back",
  },
  {
    file: "site.registry.json",
    detail:
      "the same component as a shadcn registry item, so `npx shadcn@latest add ./site.registry.json` installs the page and merges the theme tokens into an existing project",
  },
  {
    file: "AGENTS.md",
    detail:
      "the brief for whichever agent picks the folder up: which file is authoritative, the token values in full, the blocks present, and which sources can improve them",
  },
  {
    file: "bundle.zip",
    detail:
      "every one of the above in a single file, plus a `CLAUDE.md` pointing at the brief, because handing a folder over should be one drop rather than five clicks",
  },
];

function code(text: string): string {
  return `\`${text}\``;
}

function list(items: readonly string[]): string {
  return items.map(code).join(", ");
}

/** Slots whose variant code picks from the generated content instead of asking Jev. */
function autoSlots(): SlotKey[] {
  return SLOT_ORDER.filter((slot) => "auto" in SLOTS[slot]);
}

function blockLines(): string[] {
  return SLOT_ORDER.map((slot) => `- ${code(slot)}: ${list(Object.keys(SLOTS[slot].variants))}`);
}

function archetypeLines(): string[] {
  return Object.entries(ARCHETYPES).map(([key, archetype]) => {
    const optional = archetype.optional.length > 0 ? `; may also use ${list(archetype.optional)}` : "";
    return `- ${code(key)}: always ${list(archetype.required)}${optional}`;
  });
}

function sourceLines(): string[] {
  return Object.values(COMPONENT_SOURCES).map((source) => {
    const install = source.install
      ? `install ${code(source.install)}`
      : "no install command — the browser is the only way in";
    const endpoints =
      source.endpoints.length > 0
        ? `machine-readable at ${list(source.endpoints)}`
        : "no machine-readable surface";
    // The licence sits last of the facts because one of the five states its terms in a full sentence, and a sentence wedged between two clauses reads as a mistake.
    return `- ${source.name} (${code(source.url)}) — ${source.role}; improves ${list(source.blocks)}; ${install}; ${endpoints}; licence: ${source.license}. ${source.caveat}`;
  });
}

function exportLines(): string[] {
  return EXPORTS.map(({ file, detail }) => `- ${code(file)} — ${detail}`);
}

/**
 * The document, addressed to a machine that fetched it from `origin`.
 *
 * `origin` is threaded through rather than read from an environment variable because the same build answers on a preview host, a custom domain and localhost, and a baked-in address is the kind of error that only shows up in the one environment nobody tested.
 */
export function buildLlmsTxt(origin: string): string {
  const base = origin.replace(/\/+$/, "");
  const themeKeys = Object.keys(THEMES);
  const tokens = Object.keys(themeVars(themeKeys[0]!));

  const body = [
    "# loom",
    "",
    "> One sentence in, a marketing landing page out: an LLM writes the copy, the Jev model makes the judgement calls, and code owns the rules.",
    "",
    `loom is a running app, not a package. There is nothing here to install: you post a description of a business and get back a page assembled from ${SLOT_ORDER.length} block types, then download it in one of ${EXPORTS.length} formats. This file is generated from the same modules that serve the app, so the names and counts below are the ones the deployment is actually running.`,
    "",
    "The work is split three ways by where the information lives. The LLM writes the copy and reports facts that exist nowhere in the system — how many selling points there are, how many price tiers, whether the business has an interface worth showing. Jev answers what the user's own sentence already decided: page archetype, visual theme, whether a block belongs, which kind of social proof. Code owns the rest, because they are rules rather than judgements: rendering order, required blocks, and the layout consequences of the content, such as five or more selling points meaning a grid instead of a list.",
    "",
    "Blocks, in the order they render. Each is a closed set of variants and exactly one of them wins; a block with a single variant still has an id, and that id is what the edit endpoint expects:",
    ...blockLines(),
    "",
    `${list(autoSlots())} are picked by code from the generated content on the first build, so Jev is never asked about them; an explicit request still overrides the result.`,
    "",
    "Page archetypes. One is chosen per page, and it decides which blocks are required and which are merely available:",
    ...archetypeLines(),
    "",
    `Themes. ${themeKeys.length} of them, chosen by Jev from the user's description: ${list(themeKeys)}. Code never guesses here and the LLM never invents a palette.`,
    "",
    `Nothing in the generated markup names a colour, a radius or a typeface directly. Every one of them reads one of these ${tokens.length} CSS custom properties, set as an inline style on the outermost element that every block sits inside: ${list(tokens)}. A component pasted in from anywhere else arrives with a palette of its own — hex literals, or another design system's token names that resolve to nothing here — and will ignore the theme until it is rewritten onto these.`,
    "",
    `Exports. All ${EXPORTS.length} are derived from the same rendered result, so there is no second copy of the layout code anywhere:`,
    ...exportLines(),
    "",
    `Component sources loom catalogues, for an agent sent to find something better than what loom drew. There are ${Object.keys(COMPONENT_SOURCES).length} of them and not one ships a marketing page section — no hero, no testimonial block, no team grid and no footer anywhere in the set — so each improves a block loom already renders and never replaces one:`,
    ...sourceLines(),
    "",
    `Everything stated above is also served over MCP, for an agent that can spawn a process but not fetch a URL. ${code("npm run mcp")} runs a JSON-RPC server on stdio — register it with ${code("claude mcp add loom -- npm run --silent mcp")} — and it exposes ${TOOLS.length} tools: ${list(TOOLS.map((tool) => tool.name))}. They read the same modules this file is generated from, so the two surfaces cannot disagree, and a tool reply is typed rather than prose you have to parse back out of this document. Neither surface generates a page; the two endpoints below are the only thing that does.`,
    "",
    "## Generating a page",
    "",
    `- [POST /api/generate](${base}/api/generate): Body ${code('{"prompt": "...", "locale": "en"}')}. Responds ${code("application/x-ndjson")} — one JSON object per line, each tagged with a ${code("type")}: ${code("choice")} for a judgement Jev made and the confidence it made it at, ${code("plan")} for the blocks chosen, ${code("partial")} each time copy lands in another block, ${code("complete")} last. A failure arrives as an ${code("error")} event inside the stream rather than as a non-200, but the body is validated before the stream opens: a non-JSON body, a missing or non-string prompt, a prompt over ${MAX_REQUEST_CHARS} characters, or a ${code("locale")} that is not a BCP-47 tag are each a 400. Allow up to 120 seconds. With no keys configured the server replays a recorded session instead of refusing, and the ${code("X-Loom-Mode")} response header reads ${code("demo")} or ${code("live")} so a caller can tell which it got.`,
    "",
    "## Editing a page that already exists",
    "",
    `- [POST /api/edit](${base}/api/edit): Body ${code('{"prompt": "...", "present": ["nav", "hero"], "theme": "forest", "variants": {"hero": "hero_split"}, "archetype": "landing"}')}, where ${code("present")} is the page's current blocks, ${code("variants")} its current variant ids, and ${code("archetype")} the kind of page it is. Send the archetype: without it every present block is offered for removal, and a landing page can lose the hero its own archetype marks required. The same validation as above applies, plus ${code("theme")}, ${code("archetype")} and every entry of ${code("variants")} having to name something that exists. Returns one JSON object: the judged ${code("action")} with its ${code("confidence")}, whichever of ${code("slot")} / ${code("theme")} / ${code("variant")} that action needs, ${code("blockedBy")} when the request named no target confidently enough to act on, or named one the page will not give up, and ${code("speculative")} holding every branch Jev scored. One round trip, and no copy is regenerated.`,
    "",
    "## Optional",
    "",
    `- [The editor](${base}/): The browser UI — a prompt box, the decision log with every judgement and confidence, a theme picker, and the ${EXPORTS.length} download buttons. It is the surface for a person; an agent that can post to the two endpoints above needs nothing from it.`,
    `- [This file](${base}/llms.txt): Regenerated per request from the running build, so re-fetch it rather than caching the names above.`,
  ];

  return `${body.join("\n")}\n`;
}
