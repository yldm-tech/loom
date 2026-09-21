import { readdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * scripts/mcp.mjs and scripts/sources.mjs import lib/*.ts straight into Node and let Node strip the types — no build step, no dependency, which is the whole reason registering loom as an MCP server is one line. That only holds while every module in lib/ is erasable-syntax only, and until this file the constraint was stated in a prose comment in scripts/sources.mjs and enforced by nothing.
 *
 * Nothing else in the pipeline objects. `npx tsc --noEmit` accepts `export enum` and constructor parameter properties — isolatedModules rejects only `const enum` and `export =` — `next build` bundles them, and vitest transforms with esbuild, which compiles enums happily. So one enum in lib/plan.ts leaves 250 tests, the type check and the production build all green and kills `npm run mcp` at import with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: an MCP server that exits during the handshake, found by whichever agent registered loom rather than by CI.
 *
 * The check runs the stripper Node itself runs rather than grepping for `enum`, so it is also right about the cases nobody thinks to grep for: namespaces, parameter properties, `declare` in the wrong place. It covers all of lib/ and not only the three modules lib/mcp.ts imports today, because an import added later would otherwise walk out from under the guard silently.
 */
const LIB = import.meta.dirname;

describe("lib/ under Node's own type stripping", () => {
  const modules = readdirSync(LIB)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .sort();

  it("stays erasable-syntax only, so `npm run mcp` and `npm run sources` still boot after a refactor", () => {
    expect(modules.length).toBeGreaterThan(0);
    for (const file of modules) {
      const source = readFileSync(join(LIB, file), "utf8");
      expect(
        () => stripTypeScriptTypes(source, { mode: "strip" }),
        `lib/${file} contains syntax Node cannot erase`,
      ).not.toThrow();
    }
  });

  it("is checked by a stripper that still rejects the syntax in question, so a green run above means something", () => {
    // If a future Node learned to transform enums, the assertion above would
    // keep passing while guarding nothing. This is the canary for that.
    expect(() => stripTypeScriptTypes("export enum Script { Han, Kana }", { mode: "strip" })).toThrow(
      /ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX|not supported in strip-only mode/,
    );
  });
});
