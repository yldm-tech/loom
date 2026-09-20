import { describe, expect, it } from "vitest";
import { buildAgentsMd } from "@/lib/export-agents";
import { buildBundle } from "./export-bundle";

/**
 * A zip writer checked by its own reader proves nothing, so everything below goes through the reader in this file: it starts at the end-of-central-directory record, walks the central directory, and follows each entry's offset to its local header the way `unzip` does. The CRC is recomputed bitwise here rather than imported, so the table in the module is cross-checked against a second implementation instead of against itself.
 */

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

/** The end record with no archive comment, which is the only shape this exporter writes. */
const END_SIZE = 22;

type Entry = { name: string; crc: number; size: number; data: Uint8Array };

/** The textbook bit-at-a-time CRC-32. Slow and obviously correct, which is what a check wants. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Every entry the central directory declares, with the data read through the local header it points at. */
function readArchive(bytes: Uint8Array): Entry[] {
  const view = viewOf(bytes);
  const end = bytes.length - END_SIZE;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(at, true), `central directory entry ${index} has no signature`).toBe(CENTRAL_SIGNATURE);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));

    expect(view.getUint32(offset, true), `${name} points at no local header`).toBe(LOCAL_SIGNATURE);
    const stored = view.getUint32(offset + 18, true);
    const localNameLength = view.getUint16(offset + 26, true);
    const localExtraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLength + localExtraLength;

    entries.push({ name, crc, size, data: bytes.subarray(start, start + stored) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Local headers counted by walking them, so a name written twice or a stale count in the end record shows up as a mismatch. */
function countLocalHeaders(bytes: Uint8Array): number {
  const view = viewOf(bytes);
  let at = 0;
  let count = 0;
  while (at + 4 <= bytes.length && view.getUint32(at, true) === LOCAL_SIGNATURE) {
    const stored = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    at += 30 + nameLength + extraLength + stored;
    count += 1;
  }
  return count;
}

const SLOTS = ["nav", "hero", "features", "team", "faq", "footer"];

const SPEC = { root: "root", elements: { root: { type: "Page", props: { theme: "forest" } } } };

function page(): Element {
  const host = document.createElement("div");
  host.innerHTML = `<div class="antialiased" style="--accent: #1f5140"><section><h1>咖啡</h1></section></div>`;
  return host.firstElementChild!;
}

const build = (prompt = "a coffee shop in town", theme = "forest") =>
  buildBundle(page(), prompt, theme, SLOTS, SPEC, "en");

const text = (entry: Entry) => new TextDecoder().decode(entry.data);

const find = (entries: Entry[], name: string) => entries.find((entry) => entry.name === name)!;

describe("buildBundle", () => {
  it("opens with a local file header and closes with the end record, which is the pair every unzip looks for", () => {
    const bytes = build();
    const view = viewOf(bytes);
    expect(view.getUint32(0, true)).toBe(LOCAL_SIGNATURE);
    expect(view.getUint32(bytes.length - END_SIZE, true)).toBe(END_SIGNATURE);
    // A comment length other than zero would move the end record and make every offset read above wrong.
    expect(view.getUint16(bytes.length - 2, true)).toBe(0);
  });

  it("flags every name as UTF-8 in both records, so a reader is told how to decode a name rather than guessing a code page", () => {
    const bytes = build();
    const view = viewOf(bytes);
    const end = bytes.length - END_SIZE;
    let at = view.getUint32(end + 16, true);
    for (let index = 0; index < view.getUint16(end + 10, true); index += 1) {
      const offset = view.getUint32(at + 42, true);
      expect(view.getUint16(at + 8, true) & 0x0800, `central entry ${index} is not flagged UTF-8`).toBe(0x0800);
      expect(view.getUint16(offset + 6, true) & 0x0800, `local header ${index} is not flagged UTF-8`).toBe(0x0800);
      at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
  });

  it("carries the six files the handoff needs and no seventh, so one drop replaces five downloads", () => {
    const entries = readArchive(build("a coffee shop", "terminal"));
    expect(entries.map((entry) => entry.name)).toEqual([
      "site-terminal.html",
      "Site.tsx",
      "spec.json",
      "site.registry.json",
      "AGENTS.md",
      "CLAUDE.md",
    ]);
  });

  it("declares as many central directory entries as there are local headers, so no member is reachable by only one of the two paths", () => {
    const bytes = build();
    expect(readArchive(bytes)).toHaveLength(countLocalHeaders(bytes));
    expect(countLocalHeaders(bytes)).toBe(6);
  });

  it("stores a CRC and a length that match the bytes actually in the archive, so a corrupt member is caught before the agent reads it", () => {
    for (const entry of readArchive(build("我开了家咖啡店，想做个网站"))) {
      expect(entry.crc, `${entry.name} has the wrong CRC`).toBe(crc32(entry.data));
      expect(entry.size, `${entry.name} has the wrong size`).toBe(entry.data.length);
    }
  });

  it("measures CJK copy in bytes rather than characters, because a size taken off the string length produces an archive that opens here and fails on the recipient's machine", () => {
    const entries = readArchive(build("我开了家咖啡店，想做个网站，主打手冲和甜点"));
    const brief = find(entries, "AGENTS.md");
    const decoded = text(brief);
    // Three bytes per CJK character, so the gap is large rather than marginal.
    expect(decoded).toContain("我开了家咖啡店");
    expect(brief.size).toBeGreaterThan(decoded.length);
    expect(brief.size).toBe(new TextEncoder().encode(decoded).length);
  });

  it("produces the same bytes twice for the same page, so an export can be diffed and the timestamp cannot leak into it", () => {
    const root = page();
    const first = buildBundle(root, "a coffee shop", "forest", SLOTS, SPEC, "en");
    const second = buildBundle(root, "a coffee shop", "forest", SLOTS, SPEC, "en");
    expect(first).toEqual(second);
  });

  it("stores the brief exactly as buildAgentsMd wrote it, which is how the archive stays one packer and not a second exporter", () => {
    const root = page();
    const prompt = "我开了家咖啡店";
    const entries = readArchive(buildBundle(root, prompt, "forest", SLOTS, SPEC, "en"));
    expect(text(find(entries, "AGENTS.md"))).toBe(buildAgentsMd(root, prompt, "forest", SLOTS));
  });

  it("points CLAUDE.md at the brief instead of copying it, so Claude Code reads the same file every other agent does", () => {
    const entries = readArchive(build());
    expect(text(find(entries, "CLAUDE.md"))).toBe("@AGENTS.md\n");
  });

  it("serialises the spec itself with the indentation the single-file export uses, so the two downloads cannot drift apart", () => {
    const entries = readArchive(build());
    expect(text(find(entries, "spec.json"))).toBe(JSON.stringify(SPEC, null, 2));
  });

  it("writes valid JSON for a page that has no spec yet, rather than the string `undefined` that JSON.stringify returns", () => {
    const entries = readArchive(buildBundle(page(), "a coffee shop", "forest", SLOTS, undefined, "en"));
    expect(text(find(entries, "spec.json"))).toBe("null");
  });

  it("fills every member with the builder's own output, so the checks above cannot pass on an archive of empty files", () => {
    const entries = readArchive(build());
    for (const entry of entries) expect(entry.size, `${entry.name} is empty`).toBeGreaterThan(0);
    expect(text(find(entries, "site-forest.html"))).toContain("<!doctype html>");
    expect(text(find(entries, "Site.tsx"))).toContain("export default function Site()");
    expect(text(find(entries, "site.registry.json"))).toContain("registry-item.json");
    expect(text(find(entries, "AGENTS.md"))).toContain("# AGENTS.md");
  });
});
