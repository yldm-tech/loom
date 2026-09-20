import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LANGUAGES, defaultLanguage, scriptOf } from "./plan";
import { LANGUAGE_RULE, generateChunk, generateIdentity } from "./content-parallel";
import { buildStandaloneHtml } from "./export";

/**
 * These lock in the split: which script the request uses is decided here, and
 * only "did they ask for a different language" goes to the model. Measured on
 * ten prompts, the old blended question answered an English request with `zh`
 * at 0.76 confidence.
 */
describe("scriptOf", () => {
  it("reads kana before the kanji mixed in with it", () => {
    expect(scriptOf("京都で週末に陶芸教室をひらく小さな工房")).toBe("kana");
    expect(scriptOf("東京のパン屋")).toBe("kana");
  });

  it("reads hangul even when hanja appear alongside", () => {
    expect(scriptOf("서울에서 도자기 공방을 운영합니다")).toBe("hangul");
    expect(scriptOf("韓國 서울")).toBe("hangul");
  });

  it("calls unmixed han han", () => {
    expect(scriptOf("杭州一家做手冲咖啡的小店")).toBe("han");
    expect(scriptOf("台北的獨立書店")).toBe("han");
  });

  it("calls everything else latin, including punctuation and digits", () => {
    expect(scriptOf("a ceramics studio in Kyoto")).toBe("latin");
    expect(scriptOf("Café Lumière — 2 rooms, 24/7")).toBe("latin");
    expect(scriptOf("")).toBe("latin");
  });
});

describe("defaultLanguage", () => {
  it("lets the script decide when the script is decisive", () => {
    // The locale is deliberately wrong in each of these: script wins.
    expect(defaultLanguage("東京のパン屋", "en-US")).toBe("ja");
    expect(defaultLanguage("서울 도자기 공방", "en-US")).toBe("ko");
    expect(defaultLanguage("杭州的咖啡店", "en-US")).toBe("zh");
  });

  it("uses the editor's locale for latin script, which text alone cannot split", () => {
    const prompt = "a ceramics studio with weekend workshops";
    expect(defaultLanguage(prompt, "es-ES")).toBe("es");
    expect(defaultLanguage(prompt, "fr")).toBe("fr");
    expect(defaultLanguage(prompt, "pt-BR")).toBe("pt");
    expect(defaultLanguage(prompt, "de-AT")).toBe("de");
  });

  it("falls back to English rather than guessing", () => {
    const prompt = "a ceramics studio with weekend workshops";
    expect(defaultLanguage(prompt)).toBe("en");
    expect(defaultLanguage(prompt, "")).toBe("en");
    expect(defaultLanguage(prompt, "sv-SE")).toBe("en");
  });

  it("never lets a CJK locale override latin text", () => {
    // A Chinese-speaking user writing English wants an English site; the
    // request is the stronger signal, and asking for a Chinese one is an
    // explicit override handled by the model instead.
    const prompt = "a ceramics studio with weekend workshops";
    for (const locale of ["zh-CN", "zh-TW", "ja-JP", "ko-KR"]) {
      expect(defaultLanguage(prompt, locale)).toBe("en");
    }
  });

  it("only ever returns a language the copy layer knows how to write", () => {
    const prompts = ["東京のパン屋", "서울 공방", "杭州咖啡", "a studio"];
    const locales = [undefined, "en", "es", "fr", "de", "pt", "zh-TW", "sv", "xx-YY"];
    for (const prompt of prompts) {
      for (const locale of locales) {
        expect(Object.keys(LANGUAGES)).toContain(defaultLanguage(prompt, locale));
      }
    }
  });
});

describe("copy prompts carry the language where the model will follow it", () => {
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
  });

  /** Captures the request body the copy layer would have sent. */
  async function sent(run: () => Promise<unknown>) {
    let body: { messages: { role: string; content: string }[] } | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    await run();
    const system = body!.messages.find((m) => m.role === "system")!.content;
    const user = body!.messages.find((m) => m.role === "user")!.content;
    return { system, user };
  }

  const signal = new AbortController().signal;

  it("puts the rule after the schema, not before it", async () => {
    for (const language of ["fr", "de", "ko", "pt"]) {
      const { system } = await sent(() =>
        generateIdentity("k", "a bakery", signal, language),
      );
      const rule = system.indexOf(LANGUAGE_RULE[language]);
      expect(rule, language).toBeGreaterThan(-1);
      // The schema is the long Chinese middle; the rule has to come after it.
      expect(rule, language).toBeGreaterThan(system.indexOf("字段："));
      expect(rule, language).toBeGreaterThan(system.length / 2);
    }
  });

  it("repeats the rule in the user turn", async () => {
    for (const language of ["fr", "de", "ko", "pt", "zh"]) {
      const { user } = await sent(() => generateIdentity("k", "a bakery", signal, language));
      expect(user, language).toContain(LANGUAGE_RULE[language]);
      expect(user, language).toContain("a bakery");
    }
  });

  it("does the same for every chunk, not just identity", async () => {
    for (const chunk of ["features", "commerce", "place", "social"] as const) {
      const { system, user } = await sent(() =>
        generateChunk("k", chunk, "业务描述：a bakery", signal, "fr"),
      );
      expect(system.indexOf(LANGUAGE_RULE.fr), chunk).toBeGreaterThan(system.indexOf("字段："));
      expect(user, chunk).toContain(LANGUAGE_RULE.fr);
    }
  });

  it("leaves no field description that hardcodes a Chinese site", async () => {
    const seen: string[] = [];
    for (const chunk of ["features", "commerce", "place", "social"] as const) {
      const { system } = await sent(() => generateChunk("k", chunk, "x", signal, "fr"));
      seen.push(system);
    }
    seen.push((await sent(() => generateIdentity("k", "x", signal, "fr"))).system);
    // The schema may be written in Chinese; it must not demand Chinese output.
    for (const system of seen) {
      const body = system.replace(LANGUAGE_RULE.fr, "");
      expect(body).not.toContain("中文姓名");
      expect(body).not.toMatch(/"price":"¥/);
      expect(body).not.toContain("4.2万");
    }
  });
});

describe("the rendered site declares its own language", () => {
  it("exports a BCP-47 tag that matches the copy, not the template's", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>hello</p>";
    const langOf = (language?: string) =>
      (language === undefined
        ? buildStandaloneHtml(root, "t")
        : buildStandaloneHtml(root, "t", language)
      ).match(/<html lang="([^"]+)"/)![1];

    expect(langOf("zh")).toBe("zh-CN");
    expect(langOf("zh-Hant")).toBe("zh-TW");
    for (const language of ["en", "ja", "ko", "es", "fr", "de", "pt"]) {
      expect(langOf(language)).toBe(language);
    }
    // Anything that is not a language tag must not reach the attribute.
    expect(langOf('"><script>')).toBe("en");
    expect(langOf("")).toBe("en");
    expect(langOf()).toBe("en");
  });

  const read = (path: string) => readFileSync(join(import.meta.dirname, "..", path), "utf8");

  it("leaves no quotation mark baked into a block", () => {
    const source = read("app/registry.tsx");
    for (const mark of ["「", "」", "„", "«", "»"]) {
      expect(source, `${mark} is hardcoded in a block`).not.toContain(mark);
    }
    expect(source).toContain("quoted");
  });

  it("gives every language a quote style keyed off lang, including a default", () => {
    // Comments quote the selector they replaced, so strip them first.
    const css = read("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
    // Anchored: `:lang(ja) .quoted` must not stand in for the default pair.
    expect(css).toMatch(/^\.quoted\s*\{[^}]*quotes:/m);
    expect(css).toMatch(/\.quoted::before\s*\{[^}]*open-quote/);
    expect(css).toMatch(/\.quoted::after\s*\{[^}]*close-quote/);
    for (const language of ["zh", "ja", "de", "fr"]) {
      // The element's own language, not an ancestor's: the editor shell and the
      // site it renders are routinely in different languages.
      expect(css, language).toContain(`.quoted:lang(${language})`);
      expect(css, language).not.toContain(`:lang(${language}) .quoted`);
    }
  });
});
