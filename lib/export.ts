/**
 * Self-contained HTML export.
 *
 * The naive version inlines every stylesheet on the page, which drags the whole
 * Tailwind build along for a document that uses a few dozen utilities. Instead
 * this walks the live stylesheets and keeps only the rules whose selectors
 * actually match something inside the exported subtree — no second renderer, so
 * the block layouts never exist in two places.
 *
 * Every failure mode here is silent by construction: a rule wrongly dropped costs nothing at export time and shows up later as an exported page that renders differently from the one it was taken from, with no error anywhere. Two of them shipped. The pseudo-class strip list held `first|last|odd|even`, which are not pseudo-class names, so `:first-child` was rewritten to a different valid selector and the rule vanished; and the `<title>` was sanitised by deletion, so `Ben & Jerry's` exported as `Ben  Jerry's`. Both are fixed below and both are pinned in lib/export.test.ts, which is the real repair — the filter is a place where a test is worth more than the fix.
 */

/** Selectors that style the document itself rather than any element we can test. */
const ALWAYS_KEEP = /^(:root|html|body|\*|::?selection|::?backdrop|@|:where\(:root\))/;

function selectorMatches(root: Element, selectorText: string): boolean {
  for (const raw of selectorText.split(",")) {
    const selector = raw.trim();
    if (!selector) continue;
    if (ALWAYS_KEEP.test(selector)) return true;

    // Pseudo-classes and elements cannot be matched against a static tree, so the rule is tested against its own base selector instead. Two things the first version got wrong, both of which produced a *valid* replacement selector so the catch below never fired and the rule was silently dropped from the export: the list held `first|last|odd|even`, which are not pseudo-class names, so `li:first-child` became `li-child` and `p:first-of-type` became `p-of-type`; and `focus` sat ahead of `focus-visible`, so `input:focus-visible` became `input-visible`. Hence real names only, longest-first, and a `(?![a-z-])` guard so no alternative can ever match a prefix of a longer name again. The enumeration stays an enumeration on purpose — stripping any `:ident` structurally also eats the escaped colon in Tailwind's own class names (`.sm\:grid-cols-3` -> `.sm\3`), which is the same silent-drop failure one level worse.
    const base = selector
      .replace(/::[a-z-]+(\([^)]*\))?/g, "")
      .replace(
        /:(hover|focus-visible|focus-within|focus|active|visited|checked|disabled|first-child|last-child|first-of-type|last-of-type|only-child|only-of-type|not|is|where|has)(?![a-z-])(\([^)]*\))?/g,
        "",
      )
      .trim();
    if (!base) return true;

    try {
      if (root.matches(base) || root.querySelector(base)) return true;
    } catch {
      // An unsupported or malformed selector is kept rather than dropped: a
      // slightly larger file beats a silently broken one.
      return true;
    }
  }
  return false;
}

function collectRules(root: Element, rules: CSSRuleList, out: string[]): void {
  for (const rule of Array.from(rules)) {
    const type = rule.constructor.name;

    if (type === "CSSStyleRule") {
      const styleRule = rule as CSSStyleRule;
      if (selectorMatches(root, styleRule.selectorText)) out.push(styleRule.cssText);
      continue;
    }

    if (type === "CSSMediaRule" || type === "CSSSupportsRule" || type === "CSSContainerRule") {
      const grouping = rule as CSSMediaRule;
      const inner: string[] = [];
      collectRules(root, grouping.cssRules, inner);
      if (inner.length > 0) {
        const condition = (grouping as unknown as { conditionText?: string }).conditionText;
        const prelude = grouping.cssText.slice(0, grouping.cssText.indexOf("{")).trim();
        out.push(`${prelude || `@media ${condition}`} {\n${inner.join("\n")}\n}`);
      }
      continue;
    }

    // Font faces, keyframes, properties and layer statements are cheap and hard
    // to attribute to a selector, so they come along whole.
    if (
      type === "CSSFontFaceRule" ||
      type === "CSSKeyframesRule" ||
      type === "CSSPropertyRule" ||
      type === "CSSLayerBlockRule"
    ) {
      if (type === "CSSLayerBlockRule") {
        const layer = rule as unknown as CSSGroupingRule;
        const inner: string[] = [];
        collectRules(root, layer.cssRules, inner);
        if (inner.length > 0) out.push(inner.join("\n"));
      } else {
        out.push(rule.cssText);
      }
    }
  }
}

export function usedCssFor(root: Element): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectRules(root, sheet.cssRules, out);
    } catch {
      // Cross-origin stylesheet: unreadable by design.
    }
  }
  return out.join("\n");
}

/** The copy language as a BCP-47 tag a browser and a screen reader will accept. */
function htmlLang(language: string): string {
  if (language === "zh") return "zh-CN";
  if (language === "zh-Hant") return "zh-TW";
  return /^[a-z]{2}(-[A-Za-z]+)?$/.test(language) ? language : "en";
}

/** `<title>` is RCDATA, so escaping is enough and deleting is lossy: the first version stripped `[<>&]` outright and turned "Ben & Jerry's" into "Ben  Jerry's", double space included, for every business name with an ampersand. Encoding `<` keeps injection impossible while the name survives. */
function escapeTitle(title: string): string {
  return title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildStandaloneHtml(root: Element, title: string, language = "en"): string {
  const css = usedCssFor(root);
  return `<!doctype html>
<html lang="${htmlLang(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeTitle(title)}</title>
<style>
${css}
</style>
</head>
<body>
${root.outerHTML}
</body>
</html>`;
}
