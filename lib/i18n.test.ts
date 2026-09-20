import { describe, expect, it } from "vitest";
import { dict, detectLocale, LOCALE_LABELS, UI_LOCALES, type UiLocale } from "./i18n";
import zh from "@/locales/zh.json";

describe("locale files", () => {
  const reference = Object.keys(zh).sort();

  it("all carry exactly the reference keys, so nothing falls back silently", () => {
    for (const locale of UI_LOCALES) {
      expect(Object.keys(dict(locale)).sort(), `${locale}.json drifted from zh.json`).toEqual(
        reference,
      );
    }
  });

  it("has no empty strings, which would render as a blank control", () => {
    for (const locale of UI_LOCALES) {
      for (const [key, value] of Object.entries(dict(locale))) {
        if (Array.isArray(value)) {
          expect(value.length, `${locale}.${key} is empty`).toBeGreaterThan(0);
          for (const item of value) expect(String(item).trim()).not.toBe("");
        } else {
          expect(String(value).trim(), `${locale}.${key} is blank`).not.toBe("");
        }
      }
    }
  });

  it("offers the same number of examples everywhere", () => {
    const counts = UI_LOCALES.map((locale) => dict(locale).examples.length);
    expect(new Set(counts).size).toBe(1);
  });

  it("labels every locale in the switcher", () => {
    for (const locale of UI_LOCALES) expect(LOCALE_LABELS[locale]).toBeTruthy();
  });

  it("writes each locale's examples in that locale", () => {
    const han = /[一-龥]/;
    const kana = /[぀-ヿ]/;
    const hangul = /[가-힯]/;
    expect(dict("zh").examples.every((e) => han.test(e))).toBe(true);
    expect(dict("ja").examples.every((e) => kana.test(e))).toBe(true);
    expect(dict("ko").examples.every((e) => hangul.test(e))).toBe(true);
    expect(dict("en").examples.every((e) => !han.test(e) && !hangul.test(e))).toBe(true);
  });

  it("falls back to zh for an unknown locale rather than returning undefined", () => {
    expect(dict("xx" as UiLocale)).toBe(dict("zh"));
  });
});

describe("detectLocale", () => {
  const withLanguages = (languages: string[]) => {
    Object.defineProperty(navigator, "languages", { value: languages, configurable: true });
    return detectLocale();
  };

  it("matches on the primary subtag, not the full tag", () => {
    expect(withLanguages(["zh-Hans-CN"])).toBe("zh");
    expect(withLanguages(["ja-JP"])).toBe("ja");
    expect(withLanguages(["ko-KR"])).toBe("ko");
    expect(withLanguages(["en-GB"])).toBe("en");
  });

  it("takes the first supported language, skipping ones it cannot serve", () => {
    expect(withLanguages(["de-DE", "fr-FR", "ja"])).toBe("ja");
  });

  it("defaults to English when nothing matches", () => {
    expect(withLanguages(["de-DE"])).toBe("en");
  });
});
