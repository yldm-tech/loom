#!/usr/bin/env node
/**
 * The stdio transport for loom's MCP server. All of the protocol lives in lib/mcp.ts; this file moves bytes.
 *
 * An agent reaches loom by spawning this process, not by opening a browser, so it is registered as a command rather than served:
 *
 *   claude mcp add loom -- npm run --silent mcp
 *
 * Every line of stdin is one JSON-RPC message and every line of stdout is one response. Messages are framed by newline, so a chunk boundary is not a message boundary — stdin is read as a stream and the tail of a partial line is kept for the next chunk. Getting that wrong produces a server that works by hand and fails under a real client, which sends the handshake and the first request fast enough to land in one chunk.
 *
 * Nothing is written to stdout except responses. A stray log line there is not a log line to the client, it is a malformed message, and it ends the session. Diagnostics go to stderr.
 */

import { registerHooks } from "node:module";

/**
 * lib/mcp.ts is imported and run directly: Node strips the types itself (built in since 22.18), so the server needs no build step and no dependency, exactly as scripts/sources.mjs runs lib/sources.ts. The extra step here is resolution. sources.ts imports nothing at runtime; mcp.ts imports plan, themes and sources for real, and Node's ESM resolver will not add an extension to a relative specifier the way a bundler does. Writing `./plan.ts` in the module instead would fix it here and break `tsc --noEmit`, which rejects a `.ts` import extension unless allowImportingTsExtensions is on. So the extension is added during resolution, by the synchronous hook built into node:module — no loader thread, no dependency, and nothing about lib/ bent to suit this script.
 */
if (typeof registerHooks !== "function") {
  console.error(`This server resolves loom's TypeScript modules with node:module registerHooks, added in Node 22.15. Running ${process.version}.`);
  process.exit(1);
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // Fall through: a specifier that is not a TypeScript module resolves normally below, and its own error is the useful one.
      }
    }
    return nextResolve(specifier, context);
  },
});

const { handle, PARSE_ERROR } = await import("../lib/mcp.ts").catch((error) => {
  if (String(error).includes("Unknown file extension")) {
    console.error(`This server reads lib/mcp.ts with Node's own type stripping, which needs Node 22.18 or newer. Running ${process.version}.`);
    process.exit(1);
  }
  throw error;
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function consume(line) {
  if (line.trim() === "") return;
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send(PARSE_ERROR);
    return;
  }
  const response = handle(request);
  if (response !== null) send(response);
}

let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  pending += chunk;
  const lines = pending.split("\n");
  // The last element is whatever followed the final newline: empty when the chunk ended cleanly, half a message when it did not.
  pending = lines.pop() ?? "";
  for (const line of lines) consume(line);
});

// A client that closes the pipe without a trailing newline still sent that last message.
process.stdin.on("end", () => {
  consume(pending);
  pending = "";
});
