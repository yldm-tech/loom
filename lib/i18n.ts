import de from "@/locales/de.json";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";
import pt from "@/locales/pt.json";
import zh from "@/locales/zh.json";

/**
 * Editor UI strings, one JSON file per locale under `locales/`.
 *
 * Adding a language means adding a file and one line here; `zh.json` is the
 * reference and the test asserts the others carry exactly its keys, so a
 * half-translated file fails CI instead of falling back silently at runtime.
 *
 * This is separate from the language the generated site is written in — that is
 * a judgement Jev makes from the request, and a Chinese speaker building an
 * English site is a perfectly ordinary thing to want.
 */

export const UI_LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de", "pt"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const LOCALE_LABELS: Record<UiLocale, string> = {
  en: "EN",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  es: "ES",
  fr: "FR",
  de: "DE",
  pt: "PT",
};

export type Dict = typeof zh;

const DICTS: Record<UiLocale, Dict> = { en, zh, ja, ko, es, fr, de, pt };

export function dict(locale: UiLocale): Dict {
  return DICTS[locale] ?? DICTS.zh;
}

/** Best guess from the browser, used only as the initial value. */
export function detectLocale(): UiLocale {
  if (typeof navigator === "undefined") return "en";
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const lower = tag?.toLowerCase();
    if (!lower) continue;
    if (lower.startsWith("zh")) return "zh";
    if (lower.startsWith("ja")) return "ja";
    if (lower.startsWith("ko")) return "ko";
    if (lower.startsWith("es")) return "es";
    if (lower.startsWith("fr")) return "fr";
    if (lower.startsWith("de")) return "de";
    if (lower.startsWith("pt")) return "pt";
    if (lower.startsWith("en")) return "en";
  }
  return "en";
}
