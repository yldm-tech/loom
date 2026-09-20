import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildRegistryItem } from "./export-registry";
import { buildReactSource } from "@/lib/export-tsx";
import { THEMES, themeVars } from "@/lib/themes";

// jsdom throws on getComputedStyle(el, pseudo), which buildReactSource calls for every element. Nothing here is about generated content, so this stands in the empty answer a browser would give and keeps the suite output free of jsdom stack traces that would hide a real failure.
const realGetComputedStyle = globalThis.getComputedStyle;
beforeAll(() => {
  globalThis.getComputedStyle = ((el: Element, pseudo?: string | null) =>
    pseudo
      ? ({ content: "none", quotes: "auto" } as CSSStyleDeclaration)
      : realGetComputedStyle(el)) as typeof globalThis.getComputedStyle;
});
afterAll(() => {
  globalThis.getComputedStyle = realGetComputedStyle;
});

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html.trim();
  return host.firstElementChild!;
}

const SITE = element(`<div style="--accent: #1f5140"><h1>咖啡</h1><p>a {b} c</p></div>`);

function parse(root: Element, prompt: string, theme: string) {
  return JSON.parse(buildRegistryItem(root, prompt, theme));
}

describe("buildRegistryItem", () => {
  it("emits the fields the published schema marks required, so the CLI accepts the file instead of rejecting it", () => {
    // registry-item.json requires ["name", "type"] at the top level, and each files entry requires ["path", "type"] unless it is registry:file or registry:page, which also need "target".
    const item = parse(SITE, "我开了家咖啡店", "forest");
    expect(typeof item.name).toBe("string");
    expect(item.name.length).toBeGreaterThan(0);
    expect(item.type).toBe("registry:block");
    expect(item.files).toHaveLength(1);
    expect(item.files[0].path).toBe("components/site.tsx");
    expect(item.files[0].type).toBe("registry:component");
    expect(item.$schema).toBe("https://ui.shadcn.com/schema/registry-item.json");
  });

  it("uses type values from the schema's enum, so a plausible-looking invention cannot ship", () => {
    const TOP_LEVEL = [
      "registry:lib", "registry:block", "registry:component", "registry:ui", "registry:hook",
      "registry:theme", "registry:page", "registry:file", "registry:style", "registry:base",
      "registry:font", "registry:item",
    ];
    // The files enum is the same list minus registry:font, which only exists at the top level.
    const FILE_LEVEL = TOP_LEVEL.filter((type) => type !== "registry:font");
    const item = parse(SITE, "咖啡店", "ink");
    expect(TOP_LEVEL).toContain(item.type);
    expect(FILE_LEVEL).toContain(item.files[0].type);
  });

  it("omits the top-level theme key, which the schema forbids for every type except registry:base", () => {
    // The schema's allOf sets `theme`, `style`, `iconLibrary` and `baseColor` to `false` unless type is registry:base, so parking the theme name there would fail validation outright.
    const item = parse(SITE, "咖啡店", "terminal");
    expect(item).not.toHaveProperty("theme");
    expect(item).not.toHaveProperty("style");
    expect(item).not.toHaveProperty("baseColor");
    expect(item).not.toHaveProperty("iconLibrary");
  });

  it("carries all 17 theme tokens with the values THEMES holds, so the installed page looks like the previewed one", () => {
    for (const theme of Object.keys(THEMES)) {
      const vars = parse(SITE, "咖啡店", theme).cssVars.light;
      const expected = themeVars(theme);
      expect(Object.keys(vars)).toHaveLength(17);
      expect(Object.keys(expected)).toHaveLength(17);
      for (const [token, value] of Object.entries(expected)) {
        expect(vars[token.replace(/^--/, "")]).toBe(value);
      }
    }
  });

  it("keys cssVars without the leading --, the spelling the published docs use", () => {
    // Docs example: "light": { "brand": "oklch(0.205 0.015 18)" }, referenced from the tailwind block above it as hsl(var(--brand)). The CLI is what adds the dashes.
    const vars = parse(SITE, "咖啡店", "forest").cssVars.light;
    expect(Object.keys(vars)).toContain("accent");
    expect(Object.keys(vars)).toContain("accent-text");
    expect(Object.keys(vars)).toContain("radius");
    expect(Object.keys(vars).some((key) => key.startsWith("--"))).toBe(false);
  });

  it("emits keys the CLI's @theme bridge can dereference, which a leading -- would break without any error", () => {
    // shadcn 4.21.0's update-theme plugin writes the Tailwind v4 bridge with the property stripped and the value not: property `--color-${key.replace(/^--/, "")}`, value `var(--${key})`. A key of "--accent" therefore produces `var(----accent)`, which resolves to nothing while the install still reports success. Reproducing the value expression here is the only way this asymmetry fails loudly.
    const vars = parse(SITE, "咖啡店", "coral").cssVars.light;
    const bridged = Object.keys(vars).map((key) => `var(--${key})`);
    expect(bridged).toContain("var(--accent)");
    expect(bridged).toContain("var(--hero-from)");
    expect(bridged.filter((value) => value.startsWith("var(---"))).toEqual([]);
  });

  it("spells radius the way the CLI's radius-scale expansion matches, or the whole --radius-sm..4xl scale is skipped", () => {
    // That expansion keys off the literal string "radius"; "--radius" misses it silently.
    const vars = parse(SITE, "咖啡店", "warm").cssVars.light;
    expect(vars.radius).toBe(THEMES.warm!.tokens.radius);
  });

  it("puts the tokens in the light bucket, the only one the CLI maps to :root", () => {
    // Its selector rule is `bucket === "light" ? ":root" : `.${bucket}``. A loom theme is one closed palette, dark ones included, so a `dark` bucket would leave :root empty.
    const item = parse(SITE, "咖啡店", "terminal");
    expect(Object.keys(item.cssVars)).toEqual(["light"]);
    expect(item.cssVars.light.bg).toBe(THEMES.terminal!.tokens.bg);
  });

  it("names the theme the tokens actually came from, so an unknown key cannot be reported as installed", () => {
    // themes.ts resolves an unknown key to a default; this pins the name in the description to that same default.
    const item = parse(SITE, "咖啡店", "no-such-theme");
    const named = item.description.match(/loom's "([^"]+)" theme tokens/)![1];
    expect(THEMES[named]).toBeDefined();
    for (const [token, value] of Object.entries(themeVars("no-such-theme"))) {
      expect(item.cssVars.light[token.replace(/^--/, "")]).toBe(value);
    }
    expect(themeVars(named)).toEqual(themeVars("no-such-theme"));
  });

  it("takes its file content byte-for-byte from buildReactSource, proving there is no second renderer", () => {
    const prompt = "我开了家咖啡店，主打手冲";
    const item = parse(SITE, prompt, "forest");
    expect(item.files[0].content).toBe(buildReactSource(SITE, prompt));
  });

  it("reports no npm dependencies, because Site.tsx imports nothing the CLI would have to install", () => {
    // Padding this makes `add` install packages the file never imports.
    expect(parse(SITE, "咖啡店", "forest").dependencies).toEqual([]);
  });

  it("pretty-prints with a 2-space indent, so the file is reviewable where it lands", () => {
    const json = buildRegistryItem(SITE, "咖啡店", "forest");
    expect(json).toContain('\n  "name": ');
    expect(json).toBe(JSON.stringify(JSON.parse(json), null, 2));
  });
});

describe("registry name derivation", () => {
  it("collapses punctuation into single hyphens and trims the ends, so the name stays a usable URL segment", () => {
    const item = parse(SITE, "  Ada's Coffee & Tea -- Now Open!!  ", "forest");
    expect(item.name).toBe("ada-s-coffee-tea-now-open");
  });

  it("falls back rather than emitting an empty name, for a prompt with no ASCII in it at all", () => {
    for (const prompt of ["我开了家咖啡店", "", "   ", "！？。、", "\n\t"]) {
      const item = parse(SITE, prompt, "forest");
      expect(item.name).toBe("loom-site");
    }
  });

  it("never emits a name the CLI cannot use, whatever the prompt throws at it", () => {
    const prompts = [
      "我开了家咖啡店",
      "Ada's Coffee & Tea!!",
      "",
      "---",
      "Café ☕ ouvert",
      "a".repeat(200),
      "A very long sentence about a bakery that would otherwise become an unusable filename",
    ];
    for (const prompt of prompts) {
      const { name } = parse(SITE, prompt, "forest");
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(name.length).toBeLessThanOrEqual(40);
    }
  });

  it("keeps a title even when the prompt slugs away to nothing, since an empty title reads as a broken item", () => {
    expect(parse(SITE, "", "forest").title.length).toBeGreaterThan(0);
    expect(parse(SITE, "我开了家咖啡店", "forest").title).toBe("我开了家咖啡店");
  });

  it("folds a multi-line request onto one line, which both title and description sit on", () => {
    const item = parse(SITE, "咖啡店\n\n手冲   单品", "forest");
    expect(item.title).toBe("咖啡店 手冲 单品");
    expect(item.description).toContain("咖啡店 手冲 单品");
  });
});
