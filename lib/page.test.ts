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

  it("declares every piece of state it puts in a request body, because a stale one is sent as if it were current", () => {
    // The dictionary rule below caught one instance of this and the parser it uses generalises for free. The instance it did not catch: applyEdit sent `variants` — the page's current variant ids — without declaring it, so after any restyle the next edit told Jev the page still looked the way it did two edits ago, and Jev answered a question about a page that no longer existed. Nothing threw; the answer was just quietly about the wrong page.
    const state = [...SOURCE.matchAll(/const \[(\w+), set\w+\] = useState/g)].map((m) => m[1]!);
    expect(state.length, "no useState declarations found — the parser stopped matching").toBeGreaterThanOrEqual(10);

    for (const cb of found) {
      const body = /body: JSON\.stringify\(\{([^}]*)\}/.exec(cb.body);
      if (!body) continue;
      for (const field of body[1]!.split(",")) {
        // `key: value` sends `value`; a bare `key` is shorthand and sends the state of that name.
        const sent = (field.includes(":") ? field.slice(field.indexOf(":") + 1) : field).trim();
        if (!state.includes(sent)) continue;
        expect(cb.deps, `${cb.name} sends ${sent} but does not depend on it`).toMatch(
          new RegExp(`\\b${sent}\\b`),
        );
      }
    }
  });

  it("declares the dictionary as a dependency wherever it is read", () => {
    for (const cb of found) {
      if (!/\bt\./.test(cb.body)) continue;
      expect(cb.deps, `${cb.name} reads t but does not depend on it`).toMatch(/\bt\b/);
    }
  });

  const run = () => found.find((c) => c.name === "run")!;

  it("returns the editor to idle from a finally, so a dropped connection cannot leave Generate disabled until a page reload", () => {
    // The original had two `setRunning(false)` calls, neither on the failure path: one early return for a missing body and one after the read loop. A rejected fetch skipped both and the button stayed dead.
    const body = run().body;
    expect(body).toMatch(/\}\s*finally\s*\{\s*setRunning\(false\);\s*\}/);
    expect((body.match(/setRunning\(false\)/g) ?? []).length).toBe(1);
  });

  it("reads the response status before the body, so the 400 for an empty prompt is reported rather than parsed as an event", () => {
    // `{"error":"prompt is required"}` is one valid JSON line. Handed to the event loop it matches no branch, and the status sits on "Sending…" with nothing shown.
    const body = run().body;
    expect(body).toContain("response.ok");
    expect(body.indexOf("response.ok")).toBeLessThan(body.indexOf("getReader"));
  });

  it("skips a line it cannot parse instead of throwing out of the read loop, so one bad line does not discard the blocks already on screen", () => {
    const body = run().body;
    const parsed = body.indexOf("JSON.parse(line)");
    expect(parsed).toBeGreaterThan(-1);
    const opened = body.lastIndexOf("try {", parsed);
    const caught = body.indexOf("catch", parsed);
    expect(opened).toBeGreaterThan(-1);
    expect(caught).toBeGreaterThan(parsed);
    expect(body.slice(caught, caught + 300)).toContain("continue");
  });

  it("assigns the token total rather than accumulating it, because both jev rounds report the same running sum and adding them would bill a 3908-token run as 7038", () => {
    const calls = [...SOURCE.matchAll(/setTokens\(([^\n]*)/g)].map((m) => m[1]!);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) {
      expect(call, `setTokens(${call} accumulates`).not.toMatch(/current\s*\+[^+]/);
      expect(call, `setTokens(${call} accumulates`).not.toContain("+=");
    }
    // And the readout has to be fed by that state, not by the per-step field that was never written.
    expect(SOURCE).not.toContain("step.inputTokens");
    // `complete` is the one event guaranteed to arrive and it carries the final total, so it is the writer that cannot be missing. Dropping the `plan` or `select` writer only changes what the readout shows mid-run; dropping this one means a finished run reports nothing.
    const body = run().body;
    const at = body.indexOf('event.type === "complete"');
    expect(at).toBeGreaterThan(-1);
    const end = body.indexOf("} else if", at);
    expect(body.slice(at, end)).toContain("setTokens(");
  });

  it("applies every edit action lib/edit.ts can return with a target, so a planned edit cannot print a success line and change nothing", () => {
    // `unclear` is a routing label rather than an outcome, and `rewrite` has no implementation anywhere; both are named here so the exemption is visible instead of silently absent.
    const exempt = new Set(["unclear", "rewrite"]);
    const edit = readFileSync(join(import.meta.dirname, "edit.ts"), "utf8");
    const block = edit.slice(edit.indexOf("const ACTIONS"), edit.indexOf("const SLOT_LABELS"));
    const actions = [...block.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]!);
    expect(actions).toContain("add");
    const applyEdit = found.find((c) => c.name === "applyEdit")!;
    const handled = new Set(
      [...applyEdit.body.matchAll(/plan\.action === "(\w+)"/g)].map((m) => m[1]!),
    );
    for (const action of actions) {
      if (exempt.has(action)) continue;
      expect(handled.has(action), `${action} is planned but never applied`).toBe(true);
    }
  });

  it("gates every element lookup in applyEdit on isReady, because elementsFor returns a truthy element for a variant whose copy has not arrived", () => {
    const body = found.find((c) => c.name === "applyEdit")!.body;
    const lookups = [...body.matchAll(/elementsFor\(/g)].map((m) => m.index!);
    expect(lookups.length).toBeGreaterThan(0);
    for (const at of lookups) {
      expect(body.lastIndexOf("isReady(", at), "an element is spliced in ungated").toBeGreaterThan(-1);
    }
  });

  it("disables the edit form while a run is streaming, because the next partial event replaces the whole spec and reverts the edit", () => {
    const start = SOURCE.indexOf("void applyEdit()");
    expect(start).toBeGreaterThan(-1);
    const form = SOURCE.slice(start, SOURCE.indexOf("</form>", start));
    expect((form.match(/disabled=\{running\}/g) ?? []).length).toBe(2);
  });

  it("titles the HTML export from the string it actually writes, so clearing the input after a run does not save a file called nothing", () => {
    const body = found.find((c) => c.name === "exportHtml")!.body;
    expect(body).not.toContain("pickedTheme");
    expect(body).toContain('"loom"');
    expect(body).toMatch(/prompt\.trim\(\)/);
  });

  it("states the selected theme and locale in ARIA and with a non-colour cue, because a border colour is announced to nobody", () => {
    expect(SOURCE).toContain("aria-pressed={theme === key}");
    expect(SOURCE).toContain("aria-pressed={locale === code}");
    // The status line carries the whole twenty-second generation; without a live region a screen reader user hears nothing between pressing Generate and the page appearing.
    const at = SOURCE.indexOf("{status && (");
    expect(at).toBeGreaterThan(-1);
    expect(SOURCE.slice(at, at + 200)).toContain('role="status"');
    const swatch = SOURCE.indexOf("data-theme-key");
    expect(SOURCE.slice(swatch, swatch + 1200)).toContain("font-medium");
  });

  it("detects the locale in an effect rather than during render", () => {
    // Reading navigator during render would desync server and client markup.
    expect(SOURCE).toMatch(/useEffect\(\(\) => \{[\s\S]{0,200}detectLocale\(\)/);
    // It must also match the `lang` the shell ships with, or the first paint
    // is one language inside a document that claims another.
    const initial = SOURCE.match(/useState<UiLocale>\("([a-z-]+)"\)/)?.[1];
    const shell = readFileSync(join(import.meta.dirname, "..", "app/layout.tsx"), "utf8")
      .match(/<html lang="([a-z-]+)"/)?.[1];
    expect(initial).toBe(shell);
  });
});
