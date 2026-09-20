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
  zh: "README.md",
  en: "docs/README.en.md",
  ja: "docs/README.ja.md",
  ko: "docs/README.ko.md",
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
    const reference = outline(texts.zh!);
    for (const [lang, text] of Object.entries(texts)) {
      expect(outline(text), `${lang}'s section structure differs from zh`).toEqual(reference);
    }
  });

  it("each links to the other three", () => {
    for (const [lang, text] of Object.entries(texts)) {
      const header = text.split("\n")[0]!;
      for (const other of Object.keys(DOCS)) {
        if (other === lang) continue;
        const target = other === "zh" ? "README.md" : `README.${other}.md`;
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
    const figures = (text: string) =>
      [...text.matchAll(/\b0\.\d\d\b/g)].map((m) => m[0]).sort();
    const reference = figures(texts.zh!);
    for (const [lang, text] of Object.entries(texts)) {
      expect(figures(text), `${lang} quotes different numbers`).toEqual(reference);
    }
  });
});
