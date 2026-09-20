/**
 * Self-contained HTML export.
 *
 * The naive version inlines every stylesheet on the page, which drags the whole
 * Tailwind build along for a document that uses a few dozen utilities. Instead
 * this walks the live stylesheets and keeps only the rules whose selectors
 * actually match something inside the exported subtree — no second renderer, so
 * the block layouts never exist in two places.
 */

/** Selectors that style the document itself rather than any element we can test. */
const ALWAYS_KEEP = /^(:root|html|body|\*|::?selection|::?backdrop|@|:where\(:root\))/;

function selectorMatches(root: Element, selectorText: string): boolean {
  for (const raw of selectorText.split(",")) {
    const selector = raw.trim();
    if (!selector) continue;
    if (ALWAYS_KEEP.test(selector)) return true;

    // Pseudo-classes and elements cannot be matched against a static tree, so
    // the rule is tested against its own base selector instead.
    const base = selector
      .replace(/::[a-z-]+(\([^)]*\))?/g, "")
      .replace(/:(hover|focus|focus-visible|focus-within|active|visited|checked|disabled|first|last|odd|even|not|is|where|has)(\([^)]*\))?/g, "")
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

export function buildStandaloneHtml(root: Element, title: string): string {
  const css = usedCssFor(root);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/[<>&]/g, "")}</title>
<style>
${css}
</style>
</head>
<body>
${root.outerHTML}
</body>
</html>`;
}
