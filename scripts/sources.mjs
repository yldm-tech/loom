#!/usr/bin/env node
/**
 * Reachability check for the component sources in lib/sources.ts.
 *
 * The unit tests check everything about that table that can be known offline — that the slots exist, that nothing is blank, that the ordering holds. They cannot check the part that actually rots: whether the registries still answer, and with how much. That needs the network, so it stays a script you invoke rather than part of `npm test`.
 *
 * This is the inbound half of the feature. Before an agent goes shopping it says which of the five can still be enumerated without a browser, and how many components each one is offering today. The count is the point: a 200 from a registry that has quietly emptied itself looks exactly like a healthy one.
 *
 *   npm run sources
 *
 * Exit code is the verdict: non-zero if any declared endpoint failed to answer.
 */

/**
 * lib/sources.ts is imported directly rather than parsed. Node strips the types itself (built in since 22.18), the file is erasable-syntax only, and its single import is `import type`, which is erased — so nothing else in lib/ is pulled in at runtime. The alternative, regexing the table out of the TypeScript source, is exactly the kind of reader that keeps working while going wrong: the day a field is added or a string moves onto one line it silently reports a table that is not the one shipping. Importing the module cannot disagree with the module. tsx/ts-node would also work and are not dependencies here, which is the third reason.
 */
const { COMPONENT_SOURCES } = await import("../lib/sources.ts").catch((error) => {
  if (String(error).includes("Unknown file extension")) {
    console.error(`This script reads lib/sources.ts with Node's own type stripping, which needs Node 22.18 or newer. Running ${process.version}.`);
    process.exit(1);
  }
  throw error;
});

const TIMEOUT_MS = 10_000;
const UA = "loom-sources-check";

/** Where a registry index keeps its list, most specific first — beUI's payload also has a `categories` array, and the longest-array heuristic would pick the wrong one. */
const LIST_KEYS = ["components", "items", "registry", "entries"];

/** Counts entries under the `## Components` heading of an llms.txt. shadcn and beUI list them as markdown links, Rare UI as `###` sub-headings, and every file also links docs and guides that are not components — so the section has to be isolated before anything is counted. */
function countLlms(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s+components\b/i.test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  const section = end === -1 ? rest : rest.slice(0, end);

  const links = section.filter((line) => /^\s*-\s*\[[^\]]+\]\(/.test(line)).length;
  if (links > 0) return links;
  const headings = section.filter((line) => /^###\s+/.test(line)).length;
  return headings > 0 ? headings : null;
}

function countJson(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (payload === null || typeof payload !== "object") return null;
  for (const key of LIST_KEYS) {
    if (Array.isArray(payload[key])) return payload[key].length;
  }
  return null;
}

/**
 * An MCP endpoint is not a document, and a plain GET is the wrong question to ask it: beUI's answers 406 to one, which would be reported as broken when the server is perfectly healthy. Speak the protocol instead — initialize, then tools/list — and report the number of tools, which is the same kind of number as a component count.
 */
async function probeMcp(url) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": UA,
  };
  const call = (body, extra = {}) =>
    fetch(url, {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  const handshake = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: UA, version: "0" } },
  });
  await handshake.text();
  if (!handshake.ok) return { status: handshake.status, ok: false, note: "initialize refused" };

  const session = handshake.headers.get("mcp-session-id");
  const listed = await call(
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    session ? { "mcp-session-id": session, "mcp-protocol-version": "2025-06-18" } : {},
  );
  const body = await listed.text();
  if (!listed.ok) return { status: listed.status, ok: false, note: "tools/list refused" };

  // Streamable HTTP wraps the reply in server-sent events; the JSON-RPC message is the `data:` line.
  const line = body.split("\n").find((l) => l.startsWith("data:"));
  const tools = line ? JSON.parse(line.slice(5)).result?.tools : undefined;
  return { status: listed.status, ok: true, note: Array.isArray(tools) ? `${tools.length} tools` : "no tool list" };
}

async function probe(url) {
  try {
    if (/\/mcp\/?$/.test(url)) return await probeMcp(url);

    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok) return { status: response.status, ok: false, note: response.statusText.toLowerCase() || "not ok" };

    const type = response.headers.get("content-type") ?? "";
    const count = type.includes("json") || url.endsWith(".json") ? countJson(JSON.parse(body)) : countLlms(body);
    return {
      status: response.status,
      ok: true,
      note: count === null ? `${body.length} bytes, nothing countable` : `${count} components`,
    };
  } catch (error) {
    if (error.name === "TimeoutError") return { status: null, ok: false, note: `no answer in ${TIMEOUT_MS / 1000}s` };
    if (error instanceof SyntaxError) return { status: 200, ok: false, note: "answered with unparseable JSON" };
    // Node wraps DNS and TLS failures in a bare "fetch failed"; the cause carries the only useful part.
    return { status: null, ok: false, note: error.cause?.code ?? error.cause?.message ?? error.message };
  }
}

// Every endpoint goes out at once, but the results are printed back in table order so two runs diff cleanly.
const sources = Object.values(COMPONENT_SOURCES);
const results = await Promise.all(sources.map((source) => Promise.all(source.endpoints.map((url) => probe(url)))));

let checked = 0;
let failed = 0;
let browserOnly = 0;
let enumerable = 0;

for (const [index, source] of sources.entries()) {
  console.log(`${source.name} — ${source.role}`);
  if (source.endpoints.length === 0) {
    browserOnly += 1;
    console.log("  ·   browser only, no machine-readable surface to check");
    continue;
  }
  if (results[index].every((result) => result.ok)) enumerable += 1;
  for (const [i, url] of source.endpoints.entries()) {
    const result = results[index][i];
    checked += 1;
    if (!result.ok) failed += 1;
    console.log(`  ${result.ok ? "✓" : "✗"} ${String(result.status ?? "—").padEnd(3)} ${url.padEnd(46)} ${result.note}`);
  }
}

console.log(`\n${checked - failed}/${checked} endpoints answered; ${enumerable} of ${sources.length} sources enumerable without a browser, ${browserOnly} browser only.`);
process.exit(failed === 0 ? 0 : 1);
