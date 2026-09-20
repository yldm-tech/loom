import { afterEach, describe, expect, it } from "vitest";
import { buildReactSource } from "./export-tsx";

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html.trim();
  return host.firstElementChild!;
}

describe("buildReactSource", () => {
  it("renames DOM attributes React spells differently", () => {
    const source = buildReactSource(element(`<div class="a b"><label for="x">Hi</label></div>`), "t");
    expect(source).toContain('className="a b"');
    expect(source).toContain('htmlFor="x"');
    expect(source).not.toMatch(/\sclass=/);
  });

  it("casts style objects carrying CSS custom properties", () => {
    // React.CSSProperties has no index signature, so without the cast the
    // exported file does not compile. This is the bug the first version shipped.
    const source = buildReactSource(element(`<div style="--accent: #123456; color: red"></div>`), "t");
    expect(source).toContain('"--accent": "#123456"');
    expect(source).toContain("as CSSProperties");
    expect(source).toContain('import type { CSSProperties } from "react"');
  });

  it("leaves ordinary style objects uncast", () => {
    const source = buildReactSource(element(`<p style="color: red"></p>`), "t");
    expect(source).toContain("color: \"red\"");
    expect(source).not.toContain("as CSSProperties");
  });

  it("keeps a gradient intact despite the semicolons inside it", () => {
    const source = buildReactSource(
      element(`<div style="background: linear-gradient(to bottom, rgb(1,2,3), rgb(4,5,6)); color: red"></div>`),
      "t",
    );
    expect(source).toContain("linear-gradient(to bottom, rgb(1,2,3), rgb(4,5,6))");
    expect(source).toContain('color: "red"');
  });

  it("camel-cases hyphenated CSS but not custom properties", () => {
    const source = buildReactSource(element(`<div style="border-top-width: 1px; --x: 2px"></div>`), "t");
    expect(source).toContain("borderTopWidth");
    expect(source).toContain('"--x"');
  });

  it("drops the runtime fade-in, which would reference a keyframe it no longer ships", () => {
    const source = buildReactSource(
      element(`<section class="blk-in px-8"><style>.blk-in{}</style>text</section>`),
      "t",
    );
    expect(source).not.toContain("blk-in");
    expect(source).not.toContain("<style>");
    expect(source).toContain('className="px-8"');
  });

  it("self-closes void and empty elements", () => {
    const source = buildReactSource(element(`<div><br><span></span></div>`), "t");
    expect(source).toContain("<br />");
    expect(source).toContain("<span />");
  });

  it("wraps text containing braces so JSX does not read it as an expression", () => {
    const source = buildReactSource(element(`<p>a {b} c</p>`), "t");
    expect(source).toContain('{"a {b} c"}');
  });

  it("produces a default-exported component and records the request", () => {
    const source = buildReactSource(element(`<div>hi</div>`), "我开了家咖啡店");
    expect(source).toContain("export default function Site()");
    expect(source).toContain("我开了家咖啡店");
  });
});

/**
 * Quotation marks moved from the markup into CSS, and the export lost them
 * without anything noticing: the class it kept referred to a rule that does
 * not ship with the file. These bake the generated content back in.
 */
describe("CSS generated content", () => {
  const real = globalThis.getComputedStyle;
  afterEach(() => {
    globalThis.getComputedStyle = real;
  });

  /** jsdom resolves no pseudo-element content, so the values are supplied here. */
  function withPseudo(styles: Record<string, { content?: string; quotes?: string }>) {
    globalThis.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      const key = pseudo ? `${(el as HTMLElement).tagName.toLowerCase()}${pseudo}` : "";
      const own = styles[key] ?? {};
      return { content: own.content ?? "none", quotes: own.quotes ?? "auto" } as CSSStyleDeclaration;
    }) as typeof globalThis.getComputedStyle;
  }

  it("resolves open-quote and close-quote through the quotes pair", () => {
    withPseudo({
      "blockquote::before": { content: "open-quote", quotes: '"「" "」"' },
      "blockquote::after": { content: "close-quote", quotes: '"「" "」"' },
    });
    const source = buildReactSource(element(`<blockquote>很好喝</blockquote>`), "t");
    expect(source).toContain("「很好喝」");
  });

  it("keeps the marks flush against the text", () => {
    // JSX turns the newline between two pieces of text into a space, which
    // would render as 「 很好喝 」 — wrong in every language that does not
    // want one, and invisible unless you compare the strings.
    withPseudo({
      "blockquote::before": { content: "open-quote", quotes: '"「" "」"' },
      "blockquote::after": { content: "close-quote", quotes: '"「" "」"' },
    });
    const source = buildReactSource(element(`<blockquote>很好喝</blockquote>`), "t");
    expect(source).not.toContain("「\n");
    expect(source).not.toMatch(/「\s/);
    expect(source).not.toMatch(/\s」/);
  });

  it("carries a mark that is itself spaced, like the French guillemets", () => {
    withPseudo({
      "blockquote::before": { content: "open-quote", quotes: '"« " " »"' },
      "blockquote::after": { content: "close-quote", quotes: '"« " " »"' },
    });
    const source = buildReactSource(element(`<blockquote>Excellent</blockquote>`), "t");
    expect(source).toContain("« Excellent »");
  });

  it("takes a string literal as written", () => {
    withPseudo({ "span::before": { content: '"→ "' } });
    const source = buildReactSource(element(`<span>next</span>`), "t");
    expect(source).toContain("→ next");
  });

  it("adds nothing when there is no generated content", () => {
    withPseudo({});
    const source = buildReactSource(element(`<blockquote>plain</blockquote>`), "t");
    expect(source).toContain("plain");
    expect(source).not.toMatch(/[「」«»]/);
  });

  it("ignores a quote keyword with no pair to resolve it", () => {
    // `quotes: auto` is the browser's own default; there is nothing to read.
    withPseudo({ "blockquote::before": { content: "open-quote", quotes: "auto" } });
    const source = buildReactSource(element(`<blockquote>plain</blockquote>`), "t");
    expect(source).toContain("plain");
    expect(source).not.toMatch(/open-quote/);
  });

  it("drops the class that named a rule the file does not carry", () => {
    withPseudo({});
    const source = buildReactSource(
      element(`<blockquote class="quoted blk-in text-sm">x</blockquote>`),
      "t",
    );
    expect(source).toContain('className="text-sm"');
    expect(source).not.toContain("quoted");
    expect(source).not.toContain("blk-in");
  });
});
