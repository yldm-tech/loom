import { ARCHETYPES, SLOTS, SLOT_ORDER, type SlotKey } from "./plan";
import { COMPONENT_SOURCES, sourcesFor } from "./sources";
import { THEMES, themeVars } from "./themes";

/**
 * loom's contract, reachable by an agent that is not looking at a browser.
 *
 * lib/sources.ts scores five component libraries on exactly this and the scoring is the reason this file exists: three of them publish an llms.txt, one runs an MCP server, three install from a CLI — and loom, which wrote that table, published none of it. Every block name, every theme token and the whole source table was reachable only by a human clicking Export in a tab. The workflow the table was built for is "point a coding agent at good components and let it work", and until this file that workflow needed a person to paste loom's own source into the agent's context first.
 *
 * Adding a dependency is not an option here, so the JSON-RPC 2.0 framing is written out rather than taken from the MCP SDK. That costs less than it sounds like: a tools-only server owes a client `initialize`, `tools/list`, `tools/call`, and the courtesy of swallowing `notifications/initialized` without answering it. The protocol revision is 2025-11-25, the last one that opens with an initialize handshake — 2026-07-28 replaced the handshake with per-request metadata — and the clients this exists for still open with initialize. A revision the client asks for is echoed back when it is one of the handshake-era four, because a client that does not recognise the revision in the reply is told by the spec to disconnect, and the replies below are valid in all four: the older ones simply ignore `structuredContent`, which is why every tool also serialises its payload into a text block.
 *
 * Everything the tools answer with is read out of lib/plan.ts, lib/themes.ts and lib/sources.ts at call time. None of it is restated here. A tool holding its own copy of the block list is a tool that keeps answering confidently after the block list changes, and an agent has no way to notice.
 *
 * The one fact this module adds is which theme a fallback landed on. `themeVars()` answers an unknown name with forest's palette, which is right for rendering — a page still gets colours — and wrong to hand an agent unlabelled, because it would paste a green button in believing it had asked for terminal. So the reply names the theme actually returned, and a test below checks that FALLBACK_THEME is still the one themeVars picks.
 *
 * This module is pure and synchronous: no stdio, no fetch, no process. scripts/mcp.mjs is the pump and holds nothing else.
 */

/** The newest revision that still opens with an initialize handshake, which is how the clients this serves connect. */
export const PROTOCOL_VERSION = "2025-11-25";

/** Handshake-era revisions whose clients this server can answer unchanged, newest first. An older client is answered in its own revision rather than being told to disconnect over a difference that does not affect any reply here. */
export const SUPPORTED_PROTOCOL_VERSIONS = [PROTOCOL_VERSION, "2025-06-18", "2025-03-26", "2024-11-05"];

/** Tracks the version in package.json; a test fails when the two drift, because serverInfo.version is the only build identity a client ever sees. */
export const SERVER_VERSION = "0.1.0";

/** The palette themeVars() falls back to for a name it does not know. Named here so a reply can say so out loud, and asserted against themeVars in the tests rather than trusted. */
export const FALLBACK_THEME = "forest";

const PARSE = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/** A line that is not JSON never reaches handle(), so the reply the pump owes for it lives here with the rest of the protocol instead of being invented in the script. */
export const PARSE_ERROR = {
  jsonrpc: "2.0",
  id: null,
  error: { code: PARSE, message: "Could not parse that line as JSON. This server reads one JSON-RPC message per line." },
};

/** The finding lib/sources.ts is organised around, repeated to the caller because an agent that reads the table as a block catalogue goes looking for a hero in shadcn/ui and comes back with a login form. */
const SOURCE_GUIDANCE =
  "None of these libraries ships a marketing page section: there is no hero, no testimonial block, no team grid and no footer anywhere in the set. They are primitives, motion and app-shaped widgets, so a source improves a block loom already renders and never replaces one. `role` says which of the three kinds you are getting; `caveat` says what bites whoever pastes it in without reading. Anything pasted in also arrives with a palette of its own and has to be rewritten onto the CSS custom properties from theme_tokens, or the page ends up wearing two colour schemes.";

type TextContent = { type: "text"; text: string };
type ToolResult = { content: TextContent[]; structuredContent?: Record<string, unknown>; isError?: boolean };

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => ToolResult;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structured payload plus the same payload serialised, which is what a client on a revision older than 2025-06-18 reads instead. */
function ok(payload: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
}

/** A bad argument is a tool execution error, not a protocol error: the model can read it and retry, which it cannot do with a JSON-RPC error. */
function badArgument(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function requireString(args: Record<string, unknown>, field: string): string | null {
  const value = args[field];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** One block as an agent needs to see it: what it is for, whether a model or code picks the variant, and which kinds of page cannot do without it. */
function blockRows() {
  const archetypes = Object.entries(ARCHETYPES);
  return SLOT_ORDER.map((slot) => {
    const definition = SLOTS[slot];
    return {
      block: slot,
      question: definition.question,
      // `auto` in plan.ts means code decides the variant from the generated content and the model is never asked. An explicit user request still overrides it.
      chosenBy: "auto" in definition && definition.auto ? "code" : "model",
      variants: Object.entries(definition.variants).map(([id, description]) => ({ id, description })),
      requiredBy: archetypes.filter(([, page]) => (page.required as readonly string[]).includes(slot)).map(([key]) => key),
      optionalIn: archetypes.filter(([, page]) => (page.optional as readonly string[]).includes(slot)).map(([key]) => key),
    };
  });
}

/** Spread rather than picked field by field, so a column added to the source table reaches agents without anyone remembering to add it here. */
function sourceRows() {
  return Object.entries(COMPONENT_SOURCES).map(([key, source]) => ({ key, ...source }));
}

export const TOOLS: Tool[] = [
  {
    name: "list_component_sources",
    title: "Component sources worth borrowing from",
    description:
      "Lists the third-party React component libraries loom has checked, with what each one actually gives you (primitives, motion or finished widgets), its licence, the exact install command, the machine-readable endpoints that answered when last probed, the loom blocks it can improve, and the caveat that bites. Use this before writing a component by hand. Read `caveat` on every row you act on: it is where the licence restriction, the missing index and the undeclared dependency are recorded.",
    inputSchema: { type: "object", additionalProperties: false },
    run: () => ok({ guidance: SOURCE_GUIDANCE, count: Object.keys(COMPONENT_SOURCES).length, sources: sourceRows() }),
  },
  {
    name: "sources_for_block",
    title: "Component sources for one block",
    description:
      "Given one loom block name, returns the component sources that can improve that block, best-documented first — a source an agent can enumerate and install unattended sorts above a prettier one that needs a browser. An unrecognised name is answered with an empty list and an explanation, never a guess. An empty list for a real block means none of the catalogued libraries covers it and the block stays as loom rendered it.",
    inputSchema: {
      type: "object",
      properties: {
        block: {
          type: "string",
          description: "A loom block name. Call list_blocks for the full set.",
          enum: [...SLOT_ORDER],
        },
      },
      required: ["block"],
      additionalProperties: false,
    },
    run: (args) => {
      const block = requireString(args, "block");
      if (block === null) return badArgument(`This tool needs a \`block\` name. loom's blocks are: ${SLOT_ORDER.join(", ")}.`);
      if (!(block in SLOTS)) {
        return ok({
          block,
          known: false,
          sources: [],
          message: `loom has no block called "${block}", so there is nothing to recommend for it. Its blocks are: ${SLOT_ORDER.join(", ")}.`,
        });
      }
      const sources = sourcesFor(block as SlotKey);
      return ok({
        block,
        known: true,
        count: sources.length,
        sources,
        guidance: SOURCE_GUIDANCE,
        ...(sources.length === 0
          ? { message: `None of the ${Object.keys(COMPONENT_SOURCES).length} catalogued sources ships anything for the ${block} block. Writing it yourself is the only option; loom's own rendering of it is the starting point.` }
          : {}),
      });
    },
  },
  {
    name: "list_blocks",
    title: "The blocks a loom page is made of",
    description:
      "Lists every section type loom can render, in the order they appear on the page, with the variants each one has and which kinds of page require or merely allow it. `chosenBy` says who picks the variant: `model` for a judgement call, `code` for a rule applied to the generated content. Use this to learn the vocabulary the other tools take, and to know what a loom page already contains before adding anything to it.",
    inputSchema: { type: "object", additionalProperties: false },
    run: () => ok({ count: SLOT_ORDER.length, order: [...SLOT_ORDER], blocks: blockRows() }),
  },
  {
    name: "list_themes",
    title: "The visual themes a loom page can use",
    description:
      "Lists loom's themes: a closed set, one per page, each a palette and type pairing whose accent colours are checked for WCAG AA contrast. The description of each is the rubric used to decide which suits a business, written in Chinese. Call theme_tokens for the values themselves.",
    inputSchema: { type: "object", additionalProperties: false },
    run: () =>
      ok({
        count: Object.keys(THEMES).length,
        themes: Object.entries(THEMES).map(([theme, { label, description }]) => ({ theme, label, description })),
      }),
  },
  {
    name: "theme_tokens",
    title: "The CSS custom properties of one theme",
    description:
      "Returns the CSS custom properties one loom theme sets — colours, radius, typefaces, tracking. Nothing in a loom page names a colour directly; every block reads these variables off the page's outermost element. A component pasted in from another library arrives with hex literals or another design system's token names and will ignore the theme until it is rewritten onto these. An unrecognised theme name is answered with the fallback palette and told to you as such, in the `theme` and `matched` fields.",
    inputSchema: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          description: "A loom theme name. Call list_themes for the full set.",
          enum: Object.keys(THEMES),
        },
      },
      required: ["theme"],
      additionalProperties: false,
    },
    run: (args) => {
      const requested = requireString(args, "theme");
      if (requested === null) return badArgument(`This tool needs a \`theme\` name. loom's themes are: ${Object.keys(THEMES).join(", ")}.`);
      const matched = requested in THEMES;
      const theme = matched ? requested : FALLBACK_THEME;
      return ok({
        requested,
        theme,
        matched,
        tokens: themeVars(theme),
        ...(matched
          ? {}
          : {
              message: `loom has no theme called "${requested}". These are the ${FALLBACK_THEME} tokens, the palette loom falls back to — do not treat them as a palette for "${requested}". Its themes are: ${Object.keys(THEMES).join(", ")}.`,
            }),
      });
    },
  },
];

function listed({ run, ...rest }: Tool) {
  return rest;
}

function success(id: string | number, payload: object) {
  return { jsonrpc: "2.0", id, result: payload };
}

function failure(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Echo the client's revision when it is one this server can answer unchanged; otherwise name the newest it speaks and let the client decide, which is what the spec asks for. */
function negotiate(params: unknown): string {
  const requested = isObject(params) ? params.protocolVersion : undefined;
  return typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSION;
}

function initialize(params: unknown) {
  return {
    protocolVersion: negotiate(params),
    // listChanged is false and stays false: the tool list is compiled in, so there is no moment at which it could change under a connected client.
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: "loom", title: "loom", version: SERVER_VERSION },
    instructions:
      "loom generates a marketing landing page from one sentence and renders it as a fixed set of block types. These tools answer questions about that contract from outside loom: which blocks exist and what variants each has, which themes exist and the exact CSS custom properties each one sets, and a checked table of component libraries worth borrowing from, per block. Nothing here generates a page or reaches the network — every answer is read out of loom's own source when you ask for it.",
  };
}

function callTool(id: string | number, params: unknown) {
  if (!isObject(params) || typeof params.name !== "string") {
    return failure(id, INVALID_PARAMS, "tools/call needs params carrying a string `name`. Call tools/list for the names this server answers to.");
  }
  const tool = TOOLS.find((candidate) => candidate.name === params.name);
  if (!tool) {
    return failure(id, INVALID_PARAMS, `Unknown tool: ${params.name}. This server exposes ${TOOLS.map((candidate) => candidate.name).join(", ")}.`);
  }
  // A client may legitimately omit `arguments` for a tool that takes none, and a client that sends the wrong shape gets a readable tool error from the tool rather than a protocol error from here.
  return success(id, tool.run(isObject(params.arguments) ? params.arguments : {}));
}

/**
 * One JSON-RPC message in, one response object out, or null for a message that must not be answered.
 *
 * The null is not an oversight path: JSON-RPC calls an id-less message a notification and forbids a reply, and `notifications/initialized` is the one every client sends immediately after the handshake. Writing anything back for it puts a response on the stream that no client is waiting for, and from there every later id lines up against the wrong request.
 *
 * Nothing in here throws. A malformed message arrives from the other side of a pipe, and the cost of an exception is not a bad reply but a dead server: the pump exits, the client sees the process go, and the session ends mid-task.
 */
export function handle(request: unknown): object | null {
  if (!isObject(request)) {
    return failure(null, INVALID_REQUEST, "A JSON-RPC request must be a single JSON object; batches and bare values are not supported.");
  }
  if (typeof request.method !== "string") {
    return failure(null, INVALID_REQUEST, "A JSON-RPC request must carry a string `method`.");
  }
  if (!("id" in request)) return null;
  const id = request.id;
  if (typeof id !== "string" && typeof id !== "number") {
    return failure(null, INVALID_REQUEST, "A JSON-RPC `id` must be a string or a number.");
  }

  switch (request.method) {
    case "initialize":
      return success(id, initialize(request.params));
    case "tools/list":
      return success(id, { tools: TOOLS.map(listed) });
    case "tools/call":
      return callTool(id, request.params);
    default:
      return failure(id, METHOD_NOT_FOUND, `Unknown method: ${request.method}. This server implements initialize, tools/list and tools/call.`);
  }
}
