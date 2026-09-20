import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES, themeVars } from "./themes";

/**
 * Contrast is a property of the token values, so it can be checked without a browser. A theme that ships unreadable buttons is a defect in the generator, not a matter of taste, and it would otherwise only surface in an audit of one generated page that happened to use that theme.
 *
 * The first version of this file constrained six pairs while app/registry.tsx painted text on three more grounds it never mentioned: --accent-soft, --hero-from and --hero-to. The gap was not theoretical. accent on accentSoft is 4.505 in `warm` and 4.54 in `coral` — AA by a hundredth, with nothing behind it. Darkening `warm.accentSoft` by one step, the kind of nudge a palette tweak makes without thinking, takes it to 4.24 and ships the Comparison header, the Team role line and the Team avatar below AA; before these assertions the suite stayed green through exactly that, which is how 570fef6 ("coral shipped unreadable buttons, and nothing was checking") happened the first time. Every pair below names the registry site that renders it, so the list can be checked against the file rather than trusted.
 *
 * Two numbers worth stating rather than hiding. muted on accentSoft is 4.35 in `ink`: below 4.5 and fine, because muted is secondary text and the project's bar for it is 3:1 — that is why this one pair is asserted at 3. And the gradient is checked at both stops rather than only at heroFrom, because a title that clears AA where it starts and fails where it ends is still an unreadable title.
 */
function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const HEX = /^#[0-9a-f]{6}$/i;

describe("theme contrast", () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    describe(name, () => {
      const t = theme.tokens;

      it("puts readable text on the accent colour (WCAG AA, 4.5:1)", () => {
        expect(contrast(t.accent, t.accentText)).toBeGreaterThanOrEqual(4.5);
      });

      it("puts readable text on the band colour", () => {
        expect(contrast(t.band, t.bandText)).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps body text readable on both the page and surface backgrounds", () => {
        expect(contrast(t.bg, t.text)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.surface, t.text)).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps muted text above the large-text threshold at least", () => {
        // Muted is used for captions and secondary lines, never for the only
        // copy of anything, so 3:1 is the bar rather than 4.5:1.
        expect(contrast(t.bg, t.muted)).toBeGreaterThanOrEqual(3);
        expect(contrast(t.band, t.bandMuted)).toBeGreaterThanOrEqual(3);
      });

      it("keeps the accent readable where the registry uses it as a text colour rather than a fill", () => {
        // Comparison header and Team role: 13px accent on --surface and --bg.
        expect(contrast(t.bg, t.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.surface, t.accent)).toBeGreaterThanOrEqual(4.5);
        // Team avatar initial: accent on --accent-soft.
        expect(contrast(t.accentSoft, t.accent)).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps the Contact note legible on its accent-soft panel", () => {
        // registry.tsx paints props.note as --muted on --accent-soft. Muted is
        // secondary text, so the bar is the same 3:1 used for bg/muted above.
        expect(contrast(t.accentSoft, t.muted)).toBeGreaterThanOrEqual(3);
      });

      it("keeps hero copy readable at both ends of the gradient, not just where it starts", () => {
        // Two heroes and the skeleton paint on linear-gradient(--hero-from →
        // --hero-to), so a pair that only clears AA at one stop ships a title
        // that fades out halfway down.
        for (const ground of [t.heroFrom, t.heroTo]) {
          expect(contrast(ground, t.text)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(ground, t.accent)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(ground, t.muted)).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }

  it("declares every colour as a six-digit hex, so the checks above cannot be fooled", () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      for (const key of ["bg", "surface", "text", "muted", "border", "accent", "accentText", "accentSoft", "band", "bandText", "bandMuted", "heroFrom", "heroTo"] as const) {
        expect(theme.tokens[key], `${name}.${key}`).toMatch(HEX);
      }
    }
  });
});

/**
 * All eight READMEs used to say app/registry.tsx contains no hex values at all. One grep disproved it: three sit in HeroSplit's mocked screenshot, the macOS traffic lights. They stay — they depict another operating system's window chrome rather than loom's palette, and a traffic light that followed the theme would stop reading as a traffic light — so the sentence was corrected to name the exception instead. This is what keeps the corrected sentence true: three hex literals in that file, all of them in that one array.
 *
 * The assertion pins the count and the location, not the values, so re-tinting the dots does not require editing a test, while a fourth hex anywhere in the file does. Matching values here would also put a colour literal outside lib/themes.ts, which is the rule this whole check exists to enforce.
 */
describe("the registry's colours", () => {
  const source = readFileSync(join(import.meta.dirname, "..", "app", "registry.tsx"), "utf8");
  const TRAFFIC_LIGHTS = /\[("#[0-9a-fA-F]{6}", ){2}"#[0-9a-fA-F]{6}"\]\.map\(\(dot\)/;

  it("come from theme tokens everywhere but the window chrome the README names, so a theme change reaches every block", () => {
    const literals = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(literals, "app/registry.tsx grew a colour the themes cannot reach").toHaveLength(3);
    expect(source, "the three hex literals are no longer the screenshot mock's traffic lights").toMatch(
      TRAFFIC_LIGHTS,
    );
  });
});

describe("themeVars", () => {
  it("emits a custom property for every token", () => {
    const vars = themeVars("forest");
    expect(Object.keys(vars).every((k) => k.startsWith("--"))).toBe(true);
    expect(vars["--accent"]).toBe(THEMES.forest!.tokens.accent);
  });

  it("falls back to a real theme for an unknown name", () => {
    expect(themeVars("nope")).toEqual(themeVars("forest"));
  });
});
