import { describe, expect, it } from "vitest";
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
