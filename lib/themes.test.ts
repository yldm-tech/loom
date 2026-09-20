import { describe, expect, it } from "vitest";
import { THEMES, themeVars } from "./themes";

/**
 * Contrast is a property of the token values, so it can be checked without a
 * browser. A theme that ships unreadable buttons is a defect in the generator,
 * not a matter of taste, and it would otherwise only surface in an audit of one
 * generated page that happened to use that theme.
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
    });
  }

  it("declares every colour as a six-digit hex, so the check above cannot be fooled", () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      for (const key of ["bg", "surface", "text", "muted", "border", "accent", "accentText", "band", "bandText", "bandMuted"] as const) {
        expect(theme.tokens[key], `${name}.${key}`).toMatch(HEX);
      }
    }
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
