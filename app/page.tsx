"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";
import { registry } from "./registry";
import { THEMES } from "@/lib/themes";
import { elementsFor, type SiteContent } from "@/lib/content";
import { isReady } from "@/lib/content-parallel";
import { layoutRules, SLOTS, SLOT_ORDER, type SlotKey } from "@/lib/plan";
import { buildStandaloneHtml } from "@/lib/export";
import { buildReactSource } from "@/lib/export-tsx";
import { buildRegistryItem } from "@/lib/export-registry";
import { buildAgentsMd } from "@/lib/export-agents";
import { buildBundle } from "@/lib/export-bundle";
import { MAX_REQUEST_CHARS } from "@/lib/edit";
import {
  detectLocale,
  dict,
  LOCALE_LABELS,
  UI_LOCALES,
  type UiLocale,
} from "@/lib/i18n";

type StepInfo = {
  choice: string;
  elapsedMs: number;
  answers?: Record<string, { choice: string; confidence?: number }>;
};


export default function Page() {
  const [locale, setLocale] = useState<UiLocale>("en");
  const t = dict(locale);
  const [prompt, setPrompt] = useState("");

  // Locale is read after mount so the server and client render the same markup.
  useEffect(() => {
    const detected = detectLocale();
    setLocale(detected);
    setPrompt((current) => current || dict(detected).examples[0]!);
  }, []);

  // The shell ships as `en`; keep the attribute honest once the UI switches, so
  // a screen reader reads the interface in the language it is actually in.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [showTrace, setShowTrace] = useState(true);
  const [plan, setPlan] = useState<string>("");
  const [demo, setDemo] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Both jev rounds report a running total, not a per-round delta: compose.ts keeps one `inputTokens` accumulator and yields its current value on `plan`, again on `select` and again on `complete`. Summing them would advertise 7038 for a run that cost 3908, so this is assigned, never accumulated. The old code summed a field it never stored, which hid the mistake by always reading 0.
  const [tokens, setTokens] = useState(0);
  const [rounds, setRounds] = useState(0);
  const [theme, setTheme] = useState<string>("forest");
  const [siteLanguage, setSiteLanguage] = useState<string>("en");
  const [pickedTheme, setPickedTheme] = useState<string>("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editLog, setEditLog] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  // The archetype decides which blocks are required, and /api/edit refuses to remove one of those. It can only do that if the client tells it which archetype this page is, so the value is kept rather than only logged.
  const [archetype, setArchetype] = useState<string>("");
  const previewRef = useRef<HTMLDivElement>(null);
  // Kept client-side so a restyle can rebuild any block locally, with no
  // regeneration and no server round trip beyond the single intent call.
  const contentRef = useRef<SiteContent | null>(null);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const renderKey = useRef(0);

  /**
   * Consume the NDJSON stream from /api/generate.
   *
   * Everything here that is not the happy path was added after the fact. The original version checked only `response.body`, called a bare `JSON.parse` on every line, and reached `setRunning(false)` only by falling off the end of the read loop, so it had no error path at all and failed in two distinct ways. Press Generate with an empty box and the route answers 400 with `{"error":"prompt is required"}`, which is one perfectly valid JSON line that matches no `event.type` branch: the loop drained, nothing was shown, and the status sat on "Sending…". Restart the dev server mid-run, go offline, or let a proxy return an HTML 502 and `fetch`, `reader.read()` or `JSON.parse` rejects instead; the rejection escaped the `void run(...)` call site unhandled with `running` still true, which left the Generate button and every example chip disabled until the page was reloaded. The status check, the per-line try and the finally are three guards against that one missing path.
   */
  const run = useCallback(async (request: string) => {
    renderKey.current += 1;
    setRunning(true);
    setSteps([]);
    setSpec(null);
    setPlan("");
    setFailure(null);
    setTokens(0);
    setRounds(0);
    setStatus(t.sending);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: request, locale }),
      });
      // The route reports its own trouble as an in-stream `error` event, but only once the stream exists. Anything that fails earlier arrives as an ordinary body that simply is not NDJSON, so the status has to be read before the body is treated as a stream.
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        setFailure(`HTTP ${response.status} · ${detail}`);
        setStatus(`${t.error}: HTTP ${response.status}`);
        return;
      }
      if (!response.body) {
        setStatus(t.noStream);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            // One unreadable line is not a reason to abandon the blocks that already arrived; throwing here used to strand the whole editor.
            continue;
          }
          if (event.demo) setDemo(true);
          const at = `${((event.elapsedMs ?? 0) / 1000).toFixed(1)}s`;

          if (event.type === "plan") {
            setSiteLanguage((event.language as string) ?? "en");
            const optional = Object.entries(event.optional as Record<string, number>)
              .map(([slot, noul]) => `${slot} ${(noul as number).toFixed(2)}`)
              .join("  ");
            setPlan(
              `${at}  ${t.plan} → ${t.archetypeLabels[event.archetype as keyof typeof t.archetypeLabels] ?? event.archetype}@${(event.confidence ?? 0).toFixed(2)}  ·  ${event.language}${event.languageSource ? `/${event.languageSource}` : ""}  ·  ${t.theme} ${event.theme}@${(event.themeConfidence ?? 0).toFixed(2)}  ·  ${t.required} ${event.required.join(" ")}  ·  ${t.optional} ${optional || t.none}`,
            );
            setTheme(event.theme);
            setPickedTheme(event.theme);
            setSlots(event.slots as string[]);
            setArchetype(event.archetype as string);
            setVariants({});
            contentRef.current = null;
            setEditLog([]);
            setStatus(t.writingCopy);
            setTokens((current) => event.inputTokens ?? current);
            setRounds((current) => current + 1);
          } else if (event.type === "content") {
            setPlan(
              (previous) =>
                `${previous}\n${at}  ${t.copy} → ${event.brand} · ${event.tagline}`,
            );
          } else if (event.type === "picks") {
            setVariants((current) => ({ ...current, ...event.picks }));
            if (event.content) contentRef.current = event.content as SiteContent;
          } else if (event.type === "select") {
            setSteps((previous) => [
              ...previous,
              { choice: "select", elapsedMs: event.elapsedMs, answers: event.picks },
            ]);
            setTokens((current) => event.inputTokens ?? current);
            setRounds((current) => current + 1);
          } else if (event.type === "partial") {
            setPlan((previous) => `${previous}\n${at}  ${t.render} → ${event.phase}`);
            setStatus(`${event.phase} ${t.filled}`);
            setSpec(event.spec);
          } else if (event.type === "complete") {
            setStatus(`${event.stopReason} · ${t.total} ${at}`);
            // No key bump here: the final spec should reconcile into the blocks
            // already on screen, not remount and re-animate the whole page.
            if (event.spec) setSpec(event.spec);
            setTokens((current) => event.inputTokens ?? current);
          } else if (event.type === "error") {
            // A half-built page whose skeletons keep pulsing reads as "still
            // working". Freeze it and say plainly that it stopped.
            setFailure(event.message);
            setStatus(`${t.error}: ${event.message}`);
          }
        }
      }
    } catch (error) {
      // fetch rejecting, or reader.read() rejecting mid-stream: a dev server restart, a dropped tunnel, an offline browser. This used to escape as an unhandled rejection and the finally below is what stops it locking the editor.
      const message = error instanceof Error ? error.message : String(error);
      setFailure(message);
      setStatus(`${t.error}: ${message}`);
    } finally {
      setRunning(false);
    }
  }, [locale, t]);

  const applyEdit = useCallback(async () => {
    const request = editPrompt.trim();
    if (!request || !spec) return;
    setEditPrompt("");

    let plan;
    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: request, present: slots, theme, variants, archetype }),
      });
      plan = await response.json();
    } catch (error) {
      // The edit route answers its own failures as JSON, so getting here means the transport died or something upstream returned an HTML page. Letting that reject dropped the edit without even the `→ failed:` line, which is indistinguishable from having typed nothing.
      const message = error instanceof Error ? error.message : String(error);
      setEditLog((log) => [...log, `"${request}" → ${t.failed}: ${message}`]);
      return;
    }
    if (plan.error) {
      setEditLog((log) => [...log, `"${request}" → ${t.failed}: ${plan.error}`]);
      return;
    }

    const conf = (plan.confidence ?? 0).toFixed(2);
    const target = plan.variant
      ? `${plan.slot} → ${plan.variant}${plan.arbitrary ? t.arbitrary : ""}`
      : (plan.slot ?? plan.theme ?? "—");
    // `blockedBy` is the edit layer saying in words why it will not act — the page has no pricing block to drop, or every block left is required by this archetype. It travelled in the JSON from the start and nothing rendered it, so a refusal and a success both printed one log line and the user was left to guess which they got.
    setEditLog((log) => [
      ...log,
      `"${request}" → ${plan.action}@${conf} ${target} · ${plan.elapsedMs}ms`,
      ...(plan.blockedBy ? [`  ${plan.blockedBy}`] : []),
    ]);

    if (plan.action === "theme" && plan.theme) {
      setTheme(plan.theme);
      return;
    }
    if (plan.action === "restyle" && plan.slot && plan.variant) {
      const content = contentRef.current;
      if (!content) {
        setEditLog((log) => [...log, `  ${t.notReady}`]);
        return;
      }
      // `if (!element) return` used to stand here on its own and could never fire: lib/content.ts builds the whole variant table unconditionally, so looking up features_list against a half-arrived SiteContent yields a truthy element whose `props.items` is undefined, and lib/edit.ts can only ever name ids that are in that table. Splicing such an element into the spec made registry.tsx map over undefined, which @json-render's ElementErrorBoundary swallows by rendering null — the block simply vanished, with no banner and no log line. isReady is the same field table compose.ts gates its own build with.
      if (!isReady(plan.variant, content)) {
        setEditLog((log) => [...log, `  ${t.notReady}`]);
        return;
      }
      const element = elementsFor(content)[plan.variant];
      if (!element) return;
      setVariants((current) => ({ ...current, [plan.slot]: plan.variant }));
      setSpec((current) => {
        if (!current) return current;
        const elements = current.elements as Record<string, unknown>;
        return {
          ...current,
          elements: { ...elements, [`slot_${plan.slot}`]: { ...element, children: [] } },
        } as Spec;
      });
      return;
    }
    // `add` reached this function well-formed from both edit layers — lib/edit.ts builds an `add_target` question over the absent slots, lib/demo.ts replays `{action:"add", slot:"faq"}` — and nothing consumed it, so the log printed `add@1.00 faq · 3ms`, which reads as success, while the page did not change. It also made `remove` one-way. The copy is already here: compose.ts runs all four content chunks whatever the plan chose, so contentRef holds every field, including the ones for blocks the page never had.
    if (plan.action === "add" && plan.slot) {
      const content = contentRef.current;
      const slot = plan.slot as SlotKey;
      const definition = SLOTS[slot];
      if (!content || !definition) {
        setEditLog((log) => [...log, `  ${t.notReady}`]);
        return;
      }
      // Which variant a newly added block gets is decided exactly the way the first build decided it: layoutRules owns the slots marked `auto`, and for the rest the catalog's first key is a default rather than a judgement — jev's `add` answer names the slot only.
      const ruled = layoutRules(content).find((rule) => rule.slot === slot);
      const id = ruled?.id ?? Object.keys(definition.variants)[0]!;
      if (!isReady(id, content)) {
        setEditLog((log) => [...log, `  ${t.notReady}`]);
        return;
      }
      const element = elementsFor(content)[id as keyof ReturnType<typeof elementsFor>];
      if (!element) {
        setEditLog((log) => [...log, `  ${t.notReady}`]);
        return;
      }
      setSlots((current) => (current.includes(slot) ? current : [...current, slot]));
      setVariants((current) => ({ ...current, [slot]: id }));
      setSpec((current) => {
        if (!current) return current;
        const elements = current.elements as Record<string, { children?: string[] }>;
        const root = elements[current.root as string]!;
        const key = `slot_${slot}`;
        const rank = (child: string) =>
          SLOT_ORDER.indexOf(child.replace("slot_", "") as SlotKey);
        // Position is SLOT_ORDER's business, not arrival order: appending would put a newly added FAQ below the footer.
        const siblings = (root.children ?? []).filter((c) => c !== key);
        const at = siblings.findIndex((c) => rank(c) > SLOT_ORDER.indexOf(slot));
        const children =
          at < 0
            ? [...siblings, key]
            : [...siblings.slice(0, at), key, ...siblings.slice(at)];
        return {
          ...current,
          elements: {
            ...elements,
            [key]: { ...element, children: [] },
            [current.root as string]: { ...root, children },
          },
        } as Spec;
      });
      return;
    }
    if (plan.action === "remove" && plan.slot) {
      setSlots((current) => current.filter((s) => s !== plan.slot));
      setSpec((current) => {
        if (!current) return current;
        const elements = current.elements as Record<string, { children?: string[] }>;
        const root = elements[current.root as string]!;
        const key = `slot_${plan.slot}`;
        return {
          ...current,
          elements: {
            ...elements,
            [current.root as string]: {
              ...root,
              children: (root.children ?? []).filter((c) => c !== key),
            },
          },
        } as Spec;
      });
    }
  }, [editPrompt, spec, slots, theme, variants, archetype, t]);

  /**
   * Export the rendered result as one self-contained file: the block markup
   * plus every same-origin CSS rule inlined, so it opens with no server and no
   * build step. Cross-origin sheets throw on access and are skipped.
   */
  const exportHtml = useCallback(() => {
    const node = previewRef.current?.firstElementChild;
    if (!node) return;
    // The condition used to be the theme jev chose — a variable this line does not otherwise use, and one that is always set by the time the export button exists, so the "loom" fallback was dead code. Clearing the input after a run then saved a file with an empty <title>, which shows up as "Untitled" in the tab and in bookmarks. Test the value actually being written.
    const title = prompt.trim().slice(0, 40);
    const html = buildStandaloneHtml(node, title || "loom", siteLanguage);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `site-${theme}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setEditLog((log) => [
      ...log,
      `${t.exportHtml} · ${(html.length / 1024).toFixed(0)} KB`,
    ]);
  }, [prompt, theme, siteLanguage, t]);

  const exportTsx = useCallback(() => {
    const node = previewRef.current?.firstElementChild;
    if (!node) return;
    const source = buildReactSource(node, prompt);
    const blob = new Blob([source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Site.tsx";
    a.click();
    URL.revokeObjectURL(url);
    setEditLog((log) => [
      ...log,
      `${t.exportTsx} · ${(source.length / 1024).toFixed(0)} KB · ${source.split("\n").length} ${t.lines}`,
    ]);
  }, [prompt, t]);

  const exportSpec = useCallback(() => {
    if (!spec) return;
    const elements = spec.elements as Record<string, { props?: Record<string, unknown> }>;
    const root = elements[spec.root as string];
    const withTheme = root
      ? {
          ...spec,
          elements: {
            ...elements,
            [spec.root as string]: { ...root, props: { ...(root.props ?? {}), theme } },
          },
        }
      : spec;
    const blob = new Blob([JSON.stringify(withTheme, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spec.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [spec, theme]);

  /**
   * Export the page as a shadcn registry item.
   *
   * This is the only interchange format the libraries in lib/sources.ts agree on: four of the five publish one, and `npx shadcn add <url>` is how a component gets pulled into a project in the first place. Emitting the same shape sends the generated page back down that pipe, so an agent handles it with the machinery it already has rather than being handed a novel file it has to be taught about.
   */
  const exportRegistry = useCallback(() => {
    const node = previewRef.current?.firstElementChild;
    if (!node) return;
    const item = buildRegistryItem(node, prompt, theme);
    const blob = new Blob([item], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "site.registry.json";
    a.click();
    URL.revokeObjectURL(url);
    setEditLog((log) => [
      ...log,
      `${t.exportRegistry} · ${(item.length / 1024).toFixed(0)} KB`,
    ]);
  }, [prompt, theme, t]);

  /**
   * Export a brief for a coding agent rather than an artefact for a build.
   *
   * The other four exports assume whoever receives them already knows what loom rendered. An agent asked to improve the result does not: it needs the slots that are actually on the page and the honest account of what each source can and cannot do for them — none of the five ships a marketing section, so the instruction is always to improve a block that exists, never to go find a replacement for it. Left to guess, an agent looks for a hero in shadcn/ui, finds a login block, and invents something.
   */
  const exportAgents = useCallback(() => {
    const node = previewRef.current?.firstElementChild;
    if (!node) return;
    const brief = buildAgentsMd(node, prompt, theme, slots);
    const blob = new Blob([brief], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "AGENTS.md";
    a.click();
    URL.revokeObjectURL(url);
    setEditLog((log) => [
      ...log,
      `${t.exportAgents} · ${(brief.length / 1024).toFixed(0)} KB · ${slots.join(" ")}`,
    ]);
  }, [prompt, theme, slots, t]);

  /**
   * Export every format at once, as one archive.
   *
   * Each of the other five exports is a separate click producing a file that says nothing about the other four, and the two most useful to an agent are the two it is least likely to be handed: the registry item that makes the page installable and the brief that explains what the slots are. Bundling removes the choice, so the brief always arrives next to the artefacts it describes. This is the browser-side counterpart of the llms.txt and MCP surfaces lib/sources.ts catalogues in the five libraries — one address that yields everything rather than several that each yield a fragment. What goes in is buildBundle's business, not this callback's.
   */
  const exportBundle = useCallback(() => {
    const node = previewRef.current?.firstElementChild;
    if (!node || !spec) return;
    const bytes = buildBundle(node, prompt, theme, slots, spec, siteLanguage);
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bundle.zip";
    a.click();
    URL.revokeObjectURL(url);
    setEditLog((log) => [
      ...log,
      `${t.exportBundle} · ${(bytes.length / 1024).toFixed(0)} KB`,
    ]);
  }, [prompt, theme, slots, spec, siteLanguage, t]);

  // Appearance lives entirely in one prop, so re-theming costs nothing: no
  // regeneration, no model call, no new copy.
  const themedSpec = (() => {
    if (!spec) return null;
    const elements = spec.elements as Record<string, { props?: Record<string, unknown> }>;
    const root = elements[spec.root as string];
    if (!root) return spec;
    return {
      ...spec,
      elements: {
        ...elements,
        [spec.root as string]: { ...root, props: { ...(root.props ?? {}), theme } },
      },
    } as Spec;
  })();

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950">
      <div
        data-loom="panel"
        className="border-b border-neutral-300 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="mx-auto max-w-6xl">
          <div className="flex items-baseline justify-between">
            <h1 className="text-[15px] font-semibold">{t.tagline}</h1>
            <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-md border border-neutral-300 text-[12px] dark:border-neutral-700">
              {UI_LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={locale === code}
                  onClick={() => {
                    setLocale(code);
                    setPrompt(dict(code).examples[0]!);
                  }}
                  className={`px-2 py-1 ${locale === code ? "bg-neutral-900 font-semibold text-white dark:bg-white dark:text-black" : "text-neutral-500"}`}
                >
                  {LOCALE_LABELS[code]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowTrace((v) => !v)}
              className="text-[13px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {showTrace ? t.hideTrace : t.showTrace}
            </button>
            </div>
          </div>

          <form
            className="flex gap-2 pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              // An empty box used to be sent anyway; the route replies 400 and the reply happens to be one valid JSON line, so the old consumer parsed it as an event, matched nothing, and left the status on "Sending…".
              if (!running && prompt.trim()) void run(prompt);
            }}
          >
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t.placeholder}
              maxLength={MAX_REQUEST_CHARS}
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-[14px] outline-none focus:border-neutral-600 dark:border-neutral-700 dark:bg-neutral-800"
            />
            <button
              type="submit"
              data-loom="generate"
              data-running={running ? "1" : "0"}
              disabled={running}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-[14px] text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              {running ? t.generating : t.generate}
            </button>
          </form>

          <div className="flex flex-wrap gap-2 pt-3">
            {t.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setPrompt(example);
                  if (!running) void run(example);
                }}
                className="rounded-full border border-neutral-300 px-3 py-1 text-[12px] text-neutral-600 hover:border-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {example}
              </button>
            ))}
          </div>

          {demo && (
            <div
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-200"
              role="status"
            >
              {t.demoBanner}
            </div>
          )}

          {plan && (
            <div className="whitespace-pre-line pt-3 font-mono text-[12px] text-emerald-700 dark:text-emerald-400">
              {plan}
            </div>
          )}

          {failure && (
            <div
              className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[12px] text-red-900 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200"
              role="alert"
            >
              <div className="font-medium">{t.errorTitle}</div>
              <div className="pt-0.5">{t.errorBody}</div>
              <div className="pt-1 font-mono text-[11px] opacity-80">{failure}</div>
            </div>
          )}

          {spec && !failure && (
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <span className="text-[12px] text-neutral-500">{t.theme}</span>
              {Object.entries(THEMES).map(([key, swatch]) => (
                <button
                  key={key}
                  type="button"
                  data-theme-key={key}
                  aria-pressed={theme === key}
                  onClick={() => setTheme(key)}
                  title={swatch.description}
                  // Which theme is applied was carried by the border colour alone, so every pill announced identically and read identically to anyone who cannot see the border. aria-pressed states it, and the weight gives a cue that survives greyscale.
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    theme === key
                      ? "border-neutral-900 font-medium dark:border-white"
                      : "border-neutral-300 text-neutral-500 dark:border-neutral-700"
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: swatch.tokens.accent, outline: `1px solid ${swatch.tokens.border}` }}
                  />
                  {t.themeLabels[key as keyof typeof t.themeLabels] ?? key}
                  {pickedTheme === key && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">jev</span>
                  )}
                </button>
              ))}
              {/* A zero-height full-width flex item forces a wrap here, which the divider glyph it replaces could not. Six swatches and six export pills no longer fit on one line, and left to wrap on their own the exports split wherever the swatches happen to end — usually leaving the last one alone on a third line. Breaking between the two groups puts each on a line of its own, and the break reads as the divider did. */}
              <span className="basis-full" />
              <button
                type="button"
                onClick={exportHtml}
                className="rounded-full border border-neutral-300 px-2.5 py-1 text-[12px] text-neutral-600 hover:border-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {t.exportHtml}
              </button>
              <button
                type="button"
                onClick={exportTsx}
                className="rounded-full border border-neutral-300 px-2.5 py-1 text-[12px] text-neutral-600 hover:border-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {t.exportTsx}
              </button>
              <button
                type="button"
                onClick={exportSpec}
                className="rounded-full border border-neutral-300 px-2.5 py-1 text-[12px] text-neutral-600 hover:border-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {t.exportSpec}
              </button>
              <button
                type="button"
                onClick={exportRegistry}
                className="rounded-full border border-neutral-300 px-2.5 py-1 text-[12px] text-neutral-600 hover:border-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {t.exportRegistry}
              </button>
              <button
                type="button"
                onClick={exportAgents}
                className="rounded-full border border-neutral-300 px-2.5 py-1 text-[12px] text-neutral-600 hover:border-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {t.exportAgents}
              </button>
              <button
                type="button"
                onClick={exportBundle}
                className="rounded-full border border-neutral-300 px-2.5 py-1 text-[12px] text-neutral-600 hover:border-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {t.exportBundle}
              </button>
            </div>
          )}

          {spec && !failure && (
            <div className="pt-3">
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void applyEdit();
                }}
              >
                {/* The form appears as soon as the frame partial sets `spec`, which is before any LLM call, and every later `partial` and the `complete` event replace the whole spec with the server's — which knows nothing about an edit. So an edit applied mid-run was silently reverted a second or two later, and a restyle against half-arrived copy could splice in a block whose props had not landed. Disabling until the stream ends closes both. */}
                <input
                  value={editPrompt}
                  onChange={(event) => setEditPrompt(event.target.value)}
                  placeholder={t.editPlaceholder}
                  disabled={running}
                  maxLength={MAX_REQUEST_CHARS}
                  className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] outline-none focus:border-neutral-600 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800"
                />
                <button
                  type="submit"
                  disabled={running}
                  className="rounded-lg border border-neutral-400 px-3 py-1.5 text-[13px] disabled:opacity-40 dark:border-neutral-600"
                >
                  {t.edit}
                </button>
              </form>
              {editLog.length > 0 && (
                <div className="space-y-0.5 pt-2 font-mono text-[11px] text-neutral-500">
                  {editLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {status && (
            <div className="pt-3 font-mono text-[12px] text-neutral-500" role="status">
              {status}
              {tokens > 0 && ` · ${tokens} tok · ${rounds} evals`}
            </div>
          )}

          {showTrace && steps.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-3">
              {steps.flatMap((step, stepIndex) =>
                Object.entries(step.answers ?? {})
                  .filter(([, a]) => a.choice !== "omit" && !/^\d+$/.test(a.choice))
                  .map(([id, a]) => (
                    <span
                      key={`${stepIndex}-${id}`}
                      className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                    >
                      {a.choice.replace("use:", "")}
                      {a.confidence !== undefined && `@${a.confidence.toFixed(2)}`}
                    </span>
                  )),
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        <div
          ref={previewRef}
          className="overflow-hidden rounded-xl border border-neutral-300 bg-white shadow-sm dark:border-neutral-800"
        >
          {spec ? (
            <div
              data-loom="site"
              lang={siteLanguage}
              className={failure ? "opacity-60 [&_.animate-pulse]:animate-none" : undefined}
            >
            <JSONUIProvider
              key={`${renderKey.current}-${theme}`}
              registry={registry}
              initialState={spec.state ?? {}}
            >
              <Renderer spec={themedSpec!} registry={registry} />
            </JSONUIProvider>
            </div>
          ) : (
            <div className="py-32 text-center text-[15px] text-neutral-400">
              {running ? t.picking : t.empty}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
