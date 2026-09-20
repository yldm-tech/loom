import { describe, expect, it } from "vitest";
import { FALLBACK_THEME, PARSE_ERROR, PROTOCOL_VERSION, SERVER_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS, handle } from "./mcp";
import { ARCHETYPES, SLOTS, SLOT_ORDER, type ArchetypeKey } from "@/lib/plan";
import { COMPONENT_SOURCES, sourcesFor } from "@/lib/sources";
import { THEMES, themeVars } from "@/lib/themes";
import pkg from "../package.json";

/**
 * This is the half of the server that can be tested without a pipe.
 *
 * The failures worth catching here are the quiet ones. A tool listed but not wired answers nothing and the agent silently does without it; a reply written back to a notification desynchronises every id after it; a fallback palette handed over unlabelled gets pasted in as though it were the theme that was asked for. None of those show up as a crash, and the client they fail in front of is a model that will make something up rather than complain.
 *
 * The other half — that the process actually speaks this over stdio — is not testable here without spawning a child, so it is verified by hand against `npm run mcp`.
 */

type Response = {
  jsonrpc: string;
  id: string | number | null;
  result?: Record<string, any>;
  error?: { code: number; message: string };
};

function ask(request: unknown): Response {
  const response = handle(request);
  expect(response, "a request expecting a reply got none").not.toBeNull();
  return response as Response;
}

function call(name: string, args: Record<string, unknown> = {}): Record<string, any> {
  const response = ask({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } });
  expect(response.error, `${name} failed at the protocol level: ${response.error?.message}`).toBeUndefined();
  return response.result!;
}

function structured(name: string, args: Record<string, unknown> = {}): Record<string, any> {
  const result = call(name, args);
  expect(result.isError, `${name} reported a tool error: ${result.content[0]?.text}`).toBeFalsy();
  return result.structuredContent;
}

const listedTools = (): Record<string, any>[] =>
  ask({ jsonrpc: "2.0", id: 1, method: "tools/list" }).result!.tools;

describe("the handshake", () => {
  it("answers initialize with a dated protocol revision, a tools capability and an identity, so a client knows which spec the rest of the session follows before it sends anything else", () => {
    const response = ask({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "0" } },
    });

    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe(1);
    expect(response.error).toBeUndefined();
    expect(response.result!.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(PROTOCOL_VERSION, "a protocol revision is a date, and inventing one strands every client").toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(response.result!.capabilities.tools, "a server that does not declare tools will never be asked for them").toBeDefined();
    expect(response.result!.serverInfo.name).toBe("loom");
    expect(response.result!.serverInfo.version).toBe(SERVER_VERSION);
    expect(typeof response.result!.instructions, "the instructions are the only place an agent learns what loom is").toBe("string");
  });

  it("replies in the revision an older client asked for when it can answer it unchanged, because a client that does not recognise the revision in the reply disconnects", () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      const response = ask({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: version } });
      expect(response.result!.protocolVersion, `${version} was asked for and answered with something else`).toBe(version);
    }
  });

  it("falls back to its own newest revision for a version it does not speak, rather than echoing a number it cannot honour", () => {
    const response = ask({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1900-01-01" } });
    expect(response.result!.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it("keeps serverInfo.version equal to the package version, since it is the only build identity a client can see and a stale one misreports every bug report", () => {
    expect(SERVER_VERSION).toBe(pkg.version);
  });

  it("returns nothing at all for a notification, because a reply nobody is waiting for shifts every later response onto the wrong request", () => {
    expect(handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(handle({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } })).toBeNull();
  });
});

describe("the tool surface", () => {
  it("lists every tool the module defines with a callable JSON Schema, so an agent can pick one without reading loom's source", () => {
    const tools = listedTools();
    expect(tools.map((tool) => tool.name)).toEqual(TOOLS.map((tool) => tool.name));
    expect(tools.length).toBeGreaterThan(0);

    for (const tool of tools) {
      expect(tool.inputSchema?.type, `${tool.name} has no usable inputSchema type`).toBe("object");
      expect(typeof tool.description, `${tool.name} has no description for an agent to act on`).toBe("string");
      expect(tool.description.length, `${tool.name}'s description is too short to choose by`).toBeGreaterThan(40);
      expect(tool.run, `${tool.name} leaked its handler into the wire format, which JSON.stringify drops silently`).toBeUndefined();
    }
  });

  it("answers a tools/call for every tool it advertises, so a tool added to the list without a handler fails here instead of in front of an agent", () => {
    for (const { name } of listedTools()) {
      const result = call(name);
      expect(Array.isArray(result.content), `${name} answered without a content array`).toBe(true);
      expect(result.content.length, `${name} answered with empty content`).toBeGreaterThan(0);
      expect(typeof result.content[0].text).toBe("string");
    }
  });

  it("serialises the same payload into the text block that it puts in structuredContent, which is all a client older than 2025-06-18 can read", () => {
    for (const { name } of listedTools()) {
      const result = call(name);
      if (result.structuredContent === undefined) continue;
      expect(JSON.parse(result.content[0].text), `${name}'s text block disagrees with its structured payload`).toEqual(result.structuredContent);
    }
  });

  it("reports a missing required argument as a tool error the model can read and retry, not as a protocol error it cannot", () => {
    for (const name of ["sources_for_block", "theme_tokens"]) {
      const result = call(name);
      expect(result.isError, `${name} accepted a call with no arguments`).toBe(true);
      expect(result.content[0].text.length).toBeGreaterThan(0);
    }
  });
});

describe("the tools' answers", () => {
  it("hands back the source table itself rather than a copy of it, so a row edited in lib/sources.ts reaches agents the same day", () => {
    const payload = structured("list_component_sources");
    expect(payload.sources.map((source: { key: string }) => source.key)).toEqual(Object.keys(COMPONENT_SOURCES));

    for (const source of payload.sources) {
      const original = COMPONENT_SOURCES[source.key]!;
      expect(source.caveat, `${source.key}'s caveat was trimmed, which is the field that keeps the table honest`).toBe(original.caveat);
      expect(source.license).toBe(original.license);
      expect(source.install).toBe(original.install);
      expect(source.endpoints).toEqual(original.endpoints);
      expect(source.blocks).toEqual(original.blocks);
      expect(source.role).toBe(original.role);
    }
    expect(payload.guidance, "without the framing an agent reads this as a catalogue of page sections and goes looking for a hero").toContain("never replaces");
  });

  it("agrees with sourcesFor for every real block, so the tool cannot drift into a second ranking of the same table", () => {
    for (const block of SLOT_ORDER) {
      const payload = structured("sources_for_block", { block });
      expect(payload.known).toBe(true);
      expect(payload.sources, `${block} was answered with a different set than sourcesFor returns`).toEqual(sourcesFor(block));
    }
  });

  it("answers a block name loom does not have with an empty list and an explanation, so an agent is never handed a row that was made up to fill the silence", () => {
    const payload = structured("sources_for_block", { block: "carousel-of-doom" });
    expect(payload.known).toBe(false);
    expect(payload.sources).toEqual([]);
    expect(payload.message).toContain("carousel-of-doom");
    // The blocks that do exist are named in the message, because the next thing the agent does is guess again.
    expect(payload.message).toContain("hero");
  });

  it("treats a block name inherited from Object.prototype as a name loom does not have, so an agent is never told to go improve a block loom cannot render", () => {
    // `"__proto__" in SLOTS` is true, and sourcesFor then returns [] for it perfectly calmly — which is what made the wrong answer look like a right one: known: true, count: 0, and a message pointing at loom's own rendering of a block that does not exist.
    for (const block of ["__proto__", "toString", "constructor", "hasOwnProperty"]) {
      const payload = structured("sources_for_block", { block });
      expect(payload.known, `${block} was reported as a real loom block`).toBe(false);
      expect(payload.sources).toEqual([]);
      expect(payload.message, `${block} was answered without saying loom has no such block`).toContain(block);
    }
  });

  it("says so when a real block has no source covering it, instead of returning an empty list that reads like a failed lookup", () => {
    const uncovered = SLOT_ORDER.filter((block) => sourcesFor(block).length === 0);
    expect(uncovered.length, "every block is covered now, so this test no longer guards anything: check lib/sources.ts").toBeGreaterThan(0);
    for (const block of uncovered) {
      const payload = structured("sources_for_block", { block });
      expect(payload.sources).toEqual([]);
      expect(payload.message, `${block} came back empty with no explanation`).toContain(block);
    }
  });

  it("lists the blocks in render order with the archetypes that require each, so an agent learns the page's vocabulary from one call", () => {
    const payload = structured("list_blocks");
    expect(payload.blocks.map((row: { block: string }) => row.block)).toEqual([...SLOT_ORDER]);
    expect(payload.count).toBe(SLOT_ORDER.length);

    for (const row of payload.blocks) {
      const slot = row.block as keyof typeof SLOTS;
      expect(row.variants.map((variant: { id: string }) => variant.id)).toEqual(Object.keys(SLOTS[slot].variants));
      expect(row.chosenBy, `${row.block} names the wrong decider, which tells an agent to edit a choice code owns`).toBe(
        "auto" in SLOTS[slot] ? "code" : "model",
      );
      const required = Object.keys(ARCHETYPES).filter((key) =>
        (ARCHETYPES[key as ArchetypeKey].required as readonly string[]).includes(slot),
      );
      expect(row.requiredBy, `${row.block} misreports which pages cannot do without it`).toEqual(required);
    }
  });

  it("lists every theme with the rubric that explains which business it suits, since the name alone decides nothing", () => {
    const payload = structured("list_themes");
    expect(payload.themes.map((theme: { theme: string }) => theme.theme)).toEqual(Object.keys(THEMES));
    for (const theme of payload.themes) {
      expect(theme.label).toBe(THEMES[theme.theme]!.label);
      expect(theme.description).toBe(THEMES[theme.theme]!.description);
    }
  });

  it("returns a theme's custom properties exactly as the page sets them, because a pasted component rewritten onto approximate values still ignores the theme", () => {
    for (const theme of Object.keys(THEMES)) {
      const payload = structured("theme_tokens", { theme });
      expect(payload.matched).toBe(true);
      expect(payload.theme).toBe(theme);
      expect(payload.tokens).toEqual(themeVars(theme));
      expect(Object.keys(payload.tokens).every((token) => token.startsWith("--"))).toBe(true);
    }
  });

  it("names the theme it actually returned for a name it does not know, so a fallback palette cannot be pasted in as the theme that was asked for", () => {
    const payload = structured("theme_tokens", { theme: "midnight-neon" });
    expect(payload.requested).toBe("midnight-neon");
    expect(payload.matched).toBe(false);
    expect(payload.theme).toBe(FALLBACK_THEME);
    expect(payload.message).toContain(FALLBACK_THEME);
    expect(payload.tokens).toEqual(themeVars(FALLBACK_THEME));
  });

  it("answers a theme name inherited from Object.prototype with the labelled fallback instead of throwing, because an exception here does not cost a reply, it costs the session", () => {
    // This is the crash that was shipping: `"toString" in THEMES` is true, so the fallback was skipped and themeVars destructured `tokens` off Object.prototype.toString. initialize was answered, the two requests behind it never were, and the client watched the process exit.
    for (const theme of ["toString", "constructor", "valueOf", "__proto__", "isPrototypeOf"]) {
      const payload = structured("theme_tokens", { theme });
      expect(payload.matched, `${theme} was matched to a theme loom does not have`).toBe(false);
      expect(payload.theme).toBe(FALLBACK_THEME);
      expect(payload.tokens, `${theme} was answered with something other than the fallback palette`).toEqual(themeVars(FALLBACK_THEME));
      expect(payload.message).toContain(theme);
    }
  });

  it("still names the theme themeVars really falls back to, so changing that fallback in lib/themes.ts cannot leave this server mislabelling it", () => {
    expect(themeVars("no-such-theme"), `themeVars no longer falls back to ${FALLBACK_THEME}`).toEqual(themeVars(FALLBACK_THEME));
  });
});

describe("messages that arrive broken", () => {
  it("answers an unknown method with a numeric JSON-RPC error code, because a throw here takes the whole stdio session down mid-task", () => {
    const response = ask({ jsonrpc: "2.0", id: 3, method: "resources/list" });
    expect(response.id).toBe(3);
    expect(typeof response.error!.code).toBe("number");
    expect(response.error!.code).toBe(-32601);
    expect(response.result).toBeUndefined();
  });

  it("answers an unknown tool name with a JSON-RPC error naming the tools it does have, so the client can correct itself in one round trip", () => {
    const response = ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_everything" } });
    expect(response.error!.code).toBe(-32602);
    expect(response.error!.message).toContain("list_blocks");
  });

  it("answers rather than throws for anything that is not a well-formed request, since the sender is on the other side of a pipe and cannot be trusted to be one", () => {
    // Arrays other than the empty one live in the batch test below, since a batch is answered with an array of replies rather than the single envelope this loop asserts.
    const malformed: unknown[] = [
      42,
      "not a message",
      null,
      [],
      { jsonrpc: "2.0", id: 1 },
      { jsonrpc: "2.0", id: 1, method: 5 },
      { jsonrpc: "2.0", id: {}, method: "tools/list" },
      { jsonrpc: "2.0", id: 1, method: "tools/call" },
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_blocks", arguments: "nope" } },
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "theme_tokens", arguments: { theme: 12 } } },
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "theme_tokens", arguments: { theme: "toString" } } },
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sources_for_block", arguments: { block: "constructor" } } },
    ];

    for (const request of malformed) {
      expect(() => handle(request), `${JSON.stringify(request)} threw`).not.toThrow();
      const response = handle(request) as Response | null;
      if (response === null) continue;
      expect(response.jsonrpc, `${JSON.stringify(request)} was answered without the protocol marker`).toBe("2.0");
      expect(response.result !== undefined || typeof response.error?.code === "number").toBe(true);
    }
  });

  it("carries the request's id on an error whenever the message had a readable one, because a reply with id null settles no pending request and reaches the user as a timeout rather than as the reason", () => {
    for (const id of [9, "abc"]) {
      // A broken `method` is the case where the id is plainly visible and was being thrown away anyway.
      expect((ask({ jsonrpc: "2.0", id, method: 5 }) as Response).id, `id ${id} was dropped from the reply to a non-string method`).toBe(id);
      expect((ask({ jsonrpc: "2.0", id }) as Response).id, `id ${id} was dropped from the reply to a message with no method`).toBe(id);
    }
    // An id the protocol does not allow is still no id: there is nothing to echo, and null is the spec's answer.
    expect((ask({ jsonrpc: "2.0", id: {}, method: "tools/list" }) as Response).id).toBeNull();
  });

  it("answers every request in a batch with its own reply, since a batch answered by one id-less error leaves every id in it pending until the client gives up on its own", () => {
    // SUPPORTED_PROTOCOL_VERSIONS advertises 2025-03-26, the revision that requires a server to receive batches, so a client is entitled to send one.
    expect(SUPPORTED_PROTOCOL_VERSIONS, "2025-03-26 is gone, and with it the reason this server must accept batches").toContain("2025-03-26");

    const replies = handle([
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_themes" } },
      { jsonrpc: "2.0", id: 3, method: "resources/list" },
    ]) as Response[];

    expect(Array.isArray(replies), "a batch was not answered with an array of replies").toBe(true);
    // The notification is the one message that must not appear: it has no id, so a reply to it is a response the client can never claim.
    expect(replies.map((reply) => reply.id)).toEqual([1, 2, 3]);
    expect(replies[0]!.result!.tools.length).toBe(TOOLS.length);
    expect(replies[1]!.result!.structuredContent.themes.length).toBe(Object.keys(THEMES).length);
    expect(replies[2]!.error!.code).toBe(-32601);
  });

  it("returns nothing for a batch of pure notifications and an error for an empty array, keeping the one case the spec calls Invalid Request distinct from the one it forbids answering", () => {
    expect(handle([{ jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", method: "notifications/cancelled" }])).toBeNull();

    const empty = handle([]) as Response;
    expect(empty.error!.code).toBe(-32600);
    expect(Array.isArray(empty), "an empty batch was answered with an array, which is the one shape the spec rules out here").toBe(false);
  });

  it("treats a message with no id as a notification even when the rest of it is nonsense, because answering one would put an unclaimed response on the stream", () => {
    expect(handle({ jsonrpc: "2.0", method: "nothing/at/all" })).toBeNull();
  });

  it("keeps the reply for an unparseable line as a real JSON-RPC error, so the pump never has to invent protocol of its own", () => {
    expect(PARSE_ERROR.error.code).toBe(-32700);
    expect(PARSE_ERROR.id).toBeNull();
    expect(PARSE_ERROR.jsonrpc).toBe("2.0");
  });
});
