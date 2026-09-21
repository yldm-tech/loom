import { afterEach, describe, expect, it } from "vitest";
import { buildStandaloneHtml, usedCssFor } from "./export";

/**
 * The CSS filter fails silently or not at all.
 *
 * A rule it wrongly drops costs nothing at export time; it surfaces as an exported page that renders differently from the one it was taken from, with no error in any console, and the only way to notice is to compare two renderings by eye. That is exactly what happened to `:first-child` — the strip list held `first`, which is not a pseudo-class name, so the selector was rewritten to a *valid* one that matched nothing, the catch below never fired, and the rule vanished. Everything here is a case where being wrong is quiet.
 *
 * The other half is the filter's deliberate cowardice: a selector it cannot parse is KEPT, because a slightly larger file beats a silently broken one. Nothing asserted that before, so a future rewrite could have turned the fallback into a drop and nothing would have said so.
 */
function mount(css: string, html: string): Element {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("usedCssFor", () => {
  it("keeps the rules the subtree uses and drops the rest, which is the whole reason the export is not the entire Tailwind build", () => {
    const root = mount(`.card { color: red } .nowhere { color: blue } li { color: green }`, `<div class="card"><ul><li>a</li></ul></div>`);
    const css = usedCssFor(root);
    expect(css).toContain(".card");
    expect(css).toContain("li");
    expect(css).not.toContain(".nowhere");
  });

  it("matches a selector against the exported root itself, not only its descendants, so the outermost element keeps its own styling", () => {
    const root = mount(`.card { color: red }`, `<div class="card"><span>a</span></div>`);
    expect(usedCssFor(root)).toContain(".card");
  });

  it("keeps the state and pseudo-element forms of a selector whose base element is present, since neither can be matched against a static tree", () => {
    const root = mount(`a:hover { color: red } .card::before { content: "x" } a:not(.x) { color: blue }`, `<div class="card"><a href="#">go</a></div>`);
    const css = usedCssFor(root);
    expect(css).toContain("a:hover");
    expect(css).toContain(".card::before");
    expect(css).toContain("a:not(.x)");
  });

  it("keeps a structural pseudo-class whose name merely starts with another one, because the old list rewrote li:first-child into the valid-but-wrong li-child and lost the rule", () => {
    // `first`, `last`, `odd` and `even` are not pseudo-class names. Stripping them left a tail that still parsed, so querySelector returned null instead of throwing and the safety net below never ran. Every one of these is a stock Tailwind variant: `first:pt-0`, `last:border-0`, `focus-visible:ring-2`.
    const root = mount(
      `li:first-child { color: red } li:last-child { color: blue } p:first-of-type { color: green } input:focus-visible { outline: 1px solid } input:focus-within { outline: 2px solid }`,
      `<div><ul><li>a</li></ul><p>b</p><input></div>`,
    );
    const css = usedCssFor(root);
    for (const selector of ["li:first-child", "li:last-child", "p:first-of-type", "input:focus-visible", "input:focus-within"]) {
      expect(css, `${selector} was dropped from the export`).toContain(selector);
    }
  });

  it("will not strip a pseudo-class nobody enumerated just because a shorter name is a prefix of it, so the next one CSS ships cannot repeat the :first-child failure", () => {
    // `:has-slotted` is real (CSS Scoping) and is not in the strip list. Without the lookahead the list's `has` matches its first three characters and leaves `div-slotted`, which parses, matches nothing, and drops the rule with no error — the same shape as the bug this file exists for, one pseudo-class further along. Kept whole, it is unparseable here and the filter's own fallback keeps it.
    const root = mount(`div:has-slotted { color: red }`, `<div><span>a</span></div>`);
    expect(usedCssFor(root)).toContain("has-slotted");
  });

  it("drops a structural pseudo-class whose base element is absent, so the prefix fix did not turn the filter into a pass-through", () => {
    const root = mount(`table:first-child { color: red }`, `<div><span>a</span></div>`);
    expect(usedCssFor(root)).not.toContain("table");
  });

  it("keeps a Tailwind variant rule, whose selector contains an escaped colon that any structural pseudo-class strip would eat", () => {
    // `.sm\:grid-cols-3` -> `.sm\3` under a regex that strips any `:ident`, and `\3` is a valid CSS hex escape, so querySelector accepts it, matches nothing, and every responsive rule disappears. This is the trap the fix deliberately did not walk into.
    const root = mount(`.sm\\:grid-cols-3 { display: grid } .hover\\:bg-soft:hover { color: red }`, `<div class="sm:grid-cols-3 hover:bg-soft">a</div>`);
    const css = usedCssFor(root);
    expect(css).toContain("grid-cols-3");
    expect(css).toContain("bg-soft");
  });

  it("keeps a rule whose selector it cannot parse rather than dropping it, because a larger file beats a page missing a style nobody will trace", () => {
    const root = mount(`ul:totally-made-up { color: red }`, `<ul><li>a</li></ul>`);
    expect(usedCssFor(root)).toContain("totally-made-up");
  });

  it("keeps the document-level rules that no element can be tested against, which is where the theme variables live", () => {
    const root = mount(`:root { --accent: green } body { margin: 0 } * { box-sizing: border-box }`, `<div>a</div>`);
    const css = usedCssFor(root);
    expect(css).toContain(":root");
    expect(css).toContain("body");
    expect(css).toContain("box-sizing");
  });

  it("rebuilds a media query around the rules that survived it, so a responsive rule arrives still wrapped in its own condition", () => {
    const root = mount(`@media (min-width: 40rem) { li { color: teal } .nowhere { color: blue } }`, `<ul><li>a</li></ul>`);
    const css = usedCssFor(root);
    expect(css).toContain("@media (min-width: 40rem)");
    expect(css).toContain("color: teal");
    expect(css).not.toContain(".nowhere");
    expect(css.indexOf("@media")).toBeLessThan(css.indexOf("color: teal"));
  });

  it("emits no empty media block when nothing inside it matched, since an empty prelude is bytes with no effect", () => {
    const root = mount(`@media (min-width: 40rem) { .nowhere { color: blue } }`, `<ul><li>a</li></ul>`);
    expect(usedCssFor(root)).not.toContain("@media");
  });

  it("carries a font face through whole, because it belongs to no selector and dropping it changes every typeface on the page", () => {
    const root = mount(`@font-face { font-family: "X"; src: url(x.woff2) }`, `<div>a</div>`);
    expect(usedCssFor(root)).toContain("@font-face");
  });
});

describe("buildStandaloneHtml", () => {
  it("escapes the title rather than deleting from it, so a business name keeps its ampersand instead of exporting a double space", () => {
    // The first version stripped `[<>&]`, which turned "Ben & Jerry's" into "Ben  Jerry's" in the browser tab. Both callers pass the user's own prompt through unfiltered.
    const root = mount("", `<div>a</div>`);
    const title = buildStandaloneHtml(root, "Ben & Jerry's Coffee").match(/<title>(.*)<\/title>/)![1];
    expect(title).toBe("Ben &amp; Jerry's Coffee");
  });

  it("encodes angle brackets in the title instead of removing the words between them, which keeps markup out while keeping the name intact", () => {
    const root = mount("", `<div>a</div>`);
    const title = buildStandaloneHtml(root, "<Ice> Cream").match(/<title>(.*)<\/title>/)![1];
    expect(title).toBe("&lt;Ice&gt; Cream");
    expect(title).not.toContain("<Ice>");
  });

  it("inlines only the matched CSS into the head and the subtree into the body, so the file opens with no network at all", () => {
    const root = mount(`.card { color: red } .nowhere { color: blue }`, `<div class="card">hi</div>`);
    const html = buildStandaloneHtml(root, "t", "zh");
    expect(html).toContain(`<html lang="zh-CN">`);
    expect(html).toContain(".card");
    expect(html).not.toContain(".nowhere");
    expect(html).toContain(`<div class="card">hi</div>`);
    expect(html).not.toContain("<link");
  });
});
