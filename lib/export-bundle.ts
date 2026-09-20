/**
 * Every export in one archive.
 *
 * The five exports are each one button and one download, which makes the handoff five chances to drop a file — and the one that gets dropped is AGENTS.md, because it is the only one that does not look like the page. What the receiving agent then has is markup with no account of what may be edited, what the theme contract is, or where better components live. One archive is one drop.
 *
 * Nothing here renders or serialises anything. Every member is the string an existing builder already returns, and that is the rule this file exists under rather than a convenience: the thirteen block layouts live in app/registry.tsx and are read back out of the rendered DOM by buildStandaloneHtml and buildReactSource, so a second path to the same bytes would be a second thing to keep in step. This file only names the members and frames them.
 *
 * CLAUDE.md is the one member with no builder behind it, and it is here because the generated AGENTS.md says in its own first paragraph that Claude Code looks for CLAUDE.md instead. Claude Code does import one memory file from another with an `@`-prefixed path — the binary carries the "@-imported" label and an "Allow external CLAUDE.md file imports?" prompt for the case where the path escapes the working directory, which a sibling file does not — so a one-line `@AGENTS.md` costs nothing and closes the gap. It is a pointer, not a copy: duplicating the brief into a second file is exactly the failure this codebase is built to avoid.
 *
 * The zip is written here because there is no dependency to write it with. STORE, not DEFLATE: compression would mean either a package or a hand-rolled deflate, and the payload is text that gets unzipped once on arrival. Two details are load-bearing. Sizes and CRCs are measured on UTF-8 bytes rather than on string length, because the copy is routinely CJK and a length taken off the JavaScript string is a smaller number — the archive then opens in whatever tool ignores the field and fails everywhere else. And the timestamp is fixed rather than taken from the clock, so two exports of the same page are byte-identical and a test can say so.
 */

import { buildStandaloneHtml } from "./export";
import { buildReactSource } from "./export-tsx";
import { buildRegistryItem } from "./export-registry";
import { buildAgentsMd } from "./export-agents";

/** One archive member, already rendered to text by whichever builder owns it. */
type Member = { name: string; text: string };

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

/** Zip 2.0. Nothing below uses a feature added after it. */
const VERSION = 20;

/** General purpose bit 11: the filename is UTF-8 rather than the historical code page. Every name here is ASCII, but the flag is what tells a reader that, and the flag costs two bytes. */
const UTF8_FLAG = 0x0800;

/** Method 0, stored. */
const STORE = 0;

/** A fixed 2020-01-01 00:00 in DOS form — year since 1980 in bits 9-15, month in 5-8, day in 0-4. Determinism beats a true modification time for a file that is generated on download: the same page exported twice has to produce the same bytes, and a test comparing two runs is the cheapest guard this exporter can have. */
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

/** A title longer than this is a sentence, not a browser tab. Matches the slice the single-file HTML export takes. */
const TITLE_LIMIT = 40;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Little-endian fixed-width integer. Every numeric field in a zip record is one of these two widths. */
function le(value: number, width: 2 | 4): Uint8Array {
  const out = new Uint8Array(width);
  for (let index = 0; index < width; index += 1) out[index] = (value >>> (index * 8)) & 0xff;
  return out;
}

/** The buffer type argument is spelled out here and on buildBundle because `Uint8Array` alone means `Uint8Array<ArrayBufferLike>`, which includes SharedArrayBuffer and is therefore not a BlobPart — the caller that downloads these bytes does `new Blob([...])` and would not compile. */
function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * Members to archive bytes: a local header plus stored data per member, then the central directory, then the end record.
 *
 * The central directory repeats each name, CRC and size alongside the offset of its local header, and readers trust the directory over the headers. Both copies are computed from the same encoded bytes here so they cannot disagree.
 */
function zip(members: Member[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const member of members) {
    const name = encoder.encode(member.name);
    const data = encoder.encode(member.text);
    const crc = crc32(data);
    const size = data.length;

    const header = concat([
      le(LOCAL_SIGNATURE, 4),
      le(VERSION, 2),
      le(UTF8_FLAG, 2),
      le(STORE, 2),
      le(DOS_TIME, 2),
      le(DOS_DATE, 2),
      le(crc, 4),
      le(size, 4),
      le(size, 4),
      le(name.length, 2),
      le(0, 2),
      name,
    ]);
    local.push(header, data);

    central.push(
      concat([
        le(CENTRAL_SIGNATURE, 4),
        // Version made by. The low byte is the zip version, the high byte the host system: 0 is MS-DOS, which is the honest answer when the external attributes below carry no unix mode.
        le(VERSION, 2),
        le(VERSION, 2),
        le(UTF8_FLAG, 2),
        le(STORE, 2),
        le(DOS_TIME, 2),
        le(DOS_DATE, 2),
        le(crc, 4),
        le(size, 4),
        le(size, 4),
        le(name.length, 2),
        // Extra field, comment, disk number, internal attributes, external attributes: nothing to say in any of them.
        le(0, 2),
        le(0, 2),
        le(0, 2),
        le(0, 2),
        le(0, 4),
        le(offset, 4),
        name,
      ]),
    );

    offset += header.length + size;
  }

  const directory = concat(central);
  const end = concat([
    le(END_SIGNATURE, 4),
    le(0, 2),
    le(0, 2),
    le(members.length, 2),
    le(members.length, 2),
    le(directory.length, 4),
    le(offset, 4),
    le(0, 2),
  ]);

  return concat([...local, directory, end]);
}

/**
 * The whole handoff as one zip: the page, the component, the data, the installable item and the brief.
 *
 * `spec` is whatever the caller holds, which is why it arrives as unknown and is serialised here rather than being taken as a string — every other member has a builder that already decided its shape, and the spec has none. A caller with no spec yet writes `null` rather than the literal `undefined`, which is not JSON.
 */
export function buildBundle(
  root: Element,
  prompt: string,
  theme: string,
  slots: string[],
  spec: unknown,
  language: string,
): Uint8Array<ArrayBuffer> {
  const title = prompt.replace(/\s+/g, " ").trim().slice(0, TITLE_LIMIT) || "loom";

  return zip([
    { name: `site-${theme}.html`, text: buildStandaloneHtml(root, title, language) },
    { name: "Site.tsx", text: buildReactSource(root, prompt) },
    { name: "spec.json", text: JSON.stringify(spec ?? null, null, 2) },
    { name: "site.registry.json", text: buildRegistryItem(root, prompt, theme) },
    { name: "AGENTS.md", text: buildAgentsMd(root, prompt, theme, slots) },
    { name: "CLAUDE.md", text: "@AGENTS.md\n" },
  ]);
}
