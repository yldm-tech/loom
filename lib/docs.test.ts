import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Four READMEs drift the moment one is edited alone. These checks do not police
 * wording — only that every translation still covers the same ground and points
 * at the others, so a reader never lands on a stale page with no way out.
 */
const ROOT = join(import.meta.dirname, "..");
const DOCS = {
  en: "README.md",
  zh: "docs/README.zh.md",
  ja: "docs/README.ja.md",
  ko: "docs/README.ko.md",
  es: "docs/README.es.md",
  fr: "docs/README.fr.md",
  de: "docs/README.de.md",
  pt: "docs/README.pt.md",
} as const;

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
/** Depth matters: promoting an h3 to h2 keeps the count but changes the shape. */
const outline = (text: string) =>
  text
    .split("\n")
    .filter((l) => /^#{2,3} /.test(l))
    .map((l) => l.match(/^#+/)![0].length);

describe("READMEs", () => {
  const texts = Object.fromEntries(
    Object.entries(DOCS).map(([lang, path]) => [lang, read(path)]),
  );

  it("all share the same heading outline, depth included", () => {
    const reference = outline(texts.en!);
    for (const [lang, text] of Object.entries(texts)) {
      expect(outline(text), `${lang}'s section structure differs from en`).toEqual(reference);
    }
  });

  it("each links to the other three", () => {
    for (const [lang, text] of Object.entries(texts)) {
      const header = text.split("\n")[0]!;
      for (const other of Object.keys(DOCS)) {
        if (other === lang) continue;
        const target = other === "en" ? "README.md" : `README.${other}.md`;
        expect(header, `${lang} does not link to ${other}`).toContain(target);
      }
    }
  });

  it("marks the current language as current rather than linking to itself", () => {
    for (const [lang, text] of Object.entries(texts)) {
      const header = text.split("\n")[0]!;
      expect(header, `${lang} header has no bolded current language`).toMatch(/\*\*[^*]+\*\*/);
    }
  });

  it("carries the same badges everywhere", () => {
    const badgeCount = (text: string) => (text.match(/img\.shields\.io/g) ?? []).length;
    const counts = Object.values(texts).map(badgeCount);
    expect(new Set(counts).size, "badge rows differ between translations").toBe(1);
    expect(counts[0]).toBeGreaterThan(0);
  });

  it("references images that actually exist, from every translation", () => {
    // A README promising a screenshot that 404s is worse than one with none.
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    for (const [lang, text] of Object.entries(texts)) {
      const srcs = [...text.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]!);
      const local = srcs.filter((src) => !src.startsWith("http"));
      expect(local.length, `${lang} embeds no local images`).toBeGreaterThan(0);
      for (const src of local) {
        const from = lang === "en" ? ROOT : join(ROOT, "docs");
        expect(existsSync(join(from, src)), `${lang} points at a missing ${src}`).toBe(true);
      }
    }
  });

  it("ships no image nothing references", () => {
    // An orphan in docs/images/ is dead weight that still costs clone size.
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const onDisk = readdirSync(join(ROOT, "docs", "images"));
    const referenced = new Set(
      Object.values(texts).flatMap((text) =>
        [...text.matchAll(/<img[^>]+src="[^"]*?([\w.-]+\.(?:png|jpg|gif|webp))"/g)].map((m) => m[1]!),
      ),
    );
    for (const file of onDisk) {
      expect(referenced.has(file), `docs/images/${file} is never referenced`).toBe(true);
    }
  });

  /** `themes-ko-2.jpg` → kind `themes`, language `ko`, generation `2`. */
  const captures = (text: string) =>
    [...text.matchAll(/<img[^>]+src="[^"]*?(\w+)-([a-z]{2})-(\d+)\.(?:png|jpg|gif|webp)"/g)].map(
      (m) => ({ kind: m[1]!, lang: m[2]!, gen: m[3]! }),
    );

  it("shows its own screenshots, or falls back to English wholesale", () => {
    // A Chinese README illustrated with an English site is backwards, so a
    // language with its own captures must use them. A language without any
    // falls back to English — but consistently, never a mix, which would leave
    // a reader looking at two different runs side by side.
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    for (const [lang, text] of Object.entries(texts)) {
      const shots = captures(text);
      expect(shots.length, `${lang} embeds no local images`).toBeGreaterThan(0);

      const languages = new Set(shots.map((s) => s.lang));
      expect(languages.size, `${lang} mixes screenshots from different runs`).toBe(1);

      const used = [...languages][0]!;
      const own = shots[0]!.gen;
      const ownCapturesExist = existsSync(
        join(ROOT, "docs", "images", `generate-${lang}-${own}.webp`),
      );
      expect(used, `${lang} should use ${ownCapturesExist ? "its own" : "the English"} captures`).toBe(
        ownCapturesExist ? lang : "en",
      );
    }
  });

  it("keeps every README on the same capture generation", () => {
    // The filenames carry a generation because GitHub caches README images by
    // URL. If one translation is bumped alone, its readers see a different run
    // from everyone else's.
    const generations = new Set(
      Object.values(texts).flatMap((text) => captures(text).map((s) => s.gen)),
    );
    expect([...generations], "READMEs reference more than one capture generation").toHaveLength(1);
  });

  it("gives every language the same kinds of screenshot", () => {
    const kinds = (text: string) => captures(text).map((s) => s.kind).sort();
    const reference = kinds(texts.en!);
    expect(reference.length).toBeGreaterThan(0);
    for (const [lang, text] of Object.entries(texts)) {
      expect(kinds(text), `${lang} is missing a screenshot the others have`).toEqual(reference);
    }
  });

  it("all show the star history chart", () => {
    for (const [lang, text] of Object.entries(texts)) {
      expect(text, `${lang} is missing the star history chart`).toContain(
        "api.star-history.com",
      );
    }
  });

  it("quotes the same measured numbers, so no translation claims something else", () => {
    // Confidence figures are evidence, not prose: they must not drift in translation.
    // No lookahead here — CJK punctuation does not put a space after a number,
    // so anchoring on what follows would compare different things per language.
    // Spanish, French, German and Portuguese write the decimal separator as a
    // comma, which is correct localisation rather than drift, so both forms
    // normalise to the same value before comparison.
    const figures = (text: string) =>
      [...text.matchAll(/\b0[.,]\d\d\b/g)].map((m) => m[0].replace(",", ".")).sort();
    const reference = figures(texts.en!);
    for (const [lang, text] of Object.entries(texts)) {
      expect(figures(text), `${lang} quotes different numbers`).toEqual(reference);
    }
  });
});
