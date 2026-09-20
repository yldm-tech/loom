import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A useCallback that reads the locale dictionary but declares no dependency on
 * it captures whatever locale was current on first render — which, because the
 * locale is detected in an effect, is always the initial one. The symptom is
 * subtle: the UI switches language but the streaming status lines do not.
 */
const SOURCE = readFileSync(join(import.meta.dirname, "..", "app", "page.tsx"), "utf8");

function callbacks(source: string) {
  const out: { name: string; body: string; deps: string }[] = [];
  const re = /const (\w+) = useCallback\(/g;
  for (const match of source.matchAll(re)) {
    const start = match.index! + match[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") depth -= 1;
      i += 1;
    }
    const whole = source.slice(start, i - 1);
    const comma = whole.lastIndexOf(", [");
    out.push({
      name: match[1]!,
      body: whole.slice(0, comma),
      deps: whole.slice(comma + 2).trim(),
    });
  }
  return out;
}

describe("page callbacks", () => {
  const found = callbacks(SOURCE);

  it("finds the callbacks at all, so this test cannot pass vacuously", () => {
    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(found.map((c) => c.name)).toContain("run");
  });

  it("declares the dictionary as a dependency wherever it is read", () => {
    for (const cb of found) {
      if (!/\bt\./.test(cb.body)) continue;
      expect(cb.deps, `${cb.name} reads t but does not depend on it`).toMatch(/\bt\b/);
    }
  });

  it("detects the locale in an effect rather than during render", () => {
    // Reading navigator during render would desync server and client markup.
    expect(SOURCE).toMatch(/useEffect\(\(\) => \{[\s\S]{0,200}detectLocale\(\)/);
    expect(SOURCE).toMatch(/useState<UiLocale>\("zh"\)/);
  });
});
