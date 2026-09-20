"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";
import { registry } from "./registry";
import { THEMES } from "@/lib/themes";
import { elementsFor, type SiteContent } from "@/lib/content";
import { buildStandaloneHtml } from "@/lib/export";
import { buildReactSource } from "@/lib/export-tsx";
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
  inputTokens?: number | null;
  answers?: Record<string, { choice: string; confidence?: number }>;
};


export default function Page() {
  const [locale, setLocale] = useState<UiLocale>("zh");
  const t = dict(locale);
  const [prompt, setPrompt] = useState("");

  // Locale is read after mount so the server and client render the same markup.
  useEffect(() => {
    const detected = detectLocale();
    setLocale(detected);
    setPrompt((current) => current || dict(detected).examples[0]!);
  }, []);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [showTrace, setShowTrace] = useState(true);
  const [plan, setPlan] = useState<string>("");
  const [demo, setDemo] = useState(false);
  const [theme, setTheme] = useState<string>("forest");
  const [pickedTheme, setPickedTheme] = useState<string>("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editLog, setEditLog] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  // Kept client-side so a restyle can rebuild any block locally, with no
  // regeneration and no server round trip beyond the single intent call.
  const contentRef = useRef<SiteContent | null>(null);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const renderKey = useRef(0);

  const run = useCallback(async (request: string) => {
    renderKey.current += 1;
    setRunning(true);
    setSteps([]);
    setSpec(null);
    setPlan("");
    setStatus(t.sending);

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: request }),
    });
    if (!response.body) {
      setStatus(t.noStream);
      setRunning(false);
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
        const event = JSON.parse(line);
        if (event.demo) setDemo(true);
        const at = `${((event.elapsedMs ?? 0) / 1000).toFixed(1)}s`;

        if (event.type === "plan") {
          const optional = Object.entries(event.optional as Record<string, number>)
            .map(([slot, noul]) => `${slot} ${(noul as number).toFixed(2)}`)
            .join("  ");
          setPlan(
            `${at}  ${t.plan} → ${t.archetypeLabels[event.archetype as keyof typeof t.archetypeLabels] ?? event.archetype}@${(event.confidence ?? 0).toFixed(2)}  ·  ${event.language}  ·  ${t.theme} ${event.theme}@${(event.themeConfidence ?? 0).toFixed(2)}  ·  ${t.required} ${event.required.join(" ")}  ·  ${t.optional} ${optional || t.none}`,
          );
          setTheme(event.theme);
          setPickedTheme(event.theme);
          setSlots(event.slots as string[]);
          setVariants({});
          contentRef.current = null;
          setEditLog([]);
          setStatus(t.writingCopy);
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
        } else if (event.type === "partial") {
          setPlan((previous) => `${previous}\n${at}  ${t.render} → ${event.phase}`);
          setStatus(`${event.phase} ${t.filled}`);
          setSpec(event.spec);
        } else if (event.type === "complete") {
          setStatus(`${event.stopReason} · ${t.total} ${at}`);
          // No key bump here: the final spec should reconcile into the blocks
          // already on screen, not remount and re-animate the whole page.
          if (event.spec) setSpec(event.spec);
        } else if (event.type === "error") {
          setStatus(`${t.error}: ${event.message}`);
        }
      }
    }
    setRunning(false);
  }, [t]);

  const applyEdit = useCallback(async () => {
    const request = editPrompt.trim();
    if (!request || !spec) return;
    setEditPrompt("");

    const response = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: request, present: slots, theme, variants }),
    });
    const plan = await response.json();
    if (plan.error) {
      setEditLog((log) => [...log, `"${request}" → ${t.failed}: ${plan.error}`]);
      return;
    }

    const conf = (plan.confidence ?? 0).toFixed(2);
    const target = plan.variant
      ? `${plan.slot} → ${plan.variant}${plan.arbitrary ? t.arbitrary : ""}`
      : (plan.slot ?? plan.theme ?? "—");
    setEditLog((log) => [
      ...log,
      `"${request}" → ${plan.action}@${conf} ${target} · ${plan.elapsedMs}ms`,
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
  }, [editPrompt, spec, slots, theme, t]);

  /**
   * Export the rendered result as one self-contained file: the block markup
   * plus every same-origin CSS rule inlined, so it opens with no server and no
   * build step. Cross-origin sheets throw on access and are skipped.
   */
  const exportHtml = useCallback(() => {
    const node = previewRef.current?.firstElementChild;
    if (!node) return;
    const html = buildStandaloneHtml(node, pickedTheme ? prompt.slice(0, 40) : "loom");
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
  }, [prompt, pickedTheme, theme, t]);

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

  const totalTokens = steps.reduce((sum, step) => sum + (step.inputTokens ?? 0), 0);

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
      <div className="border-b border-neutral-300 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-baseline justify-between">
            <h1 className="text-[15px] font-semibold">{t.tagline}</h1>
            <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-md border border-neutral-300 text-[12px] dark:border-neutral-700">
              {UI_LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLocale(code);
                    setPrompt(dict(code).examples[0]!);
                  }}
                  className={`px-2 py-1 ${locale === code ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : "text-neutral-500"}`}
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
              if (!running) void run(prompt);
            }}
          >
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t.placeholder}
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-[14px] outline-none focus:border-neutral-600 dark:border-neutral-700 dark:bg-neutral-800"
            />
            <button
              type="submit"
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

          {spec && (
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <span className="text-[12px] text-neutral-500">{t.theme}</span>
              {Object.entries(THEMES).map(([key, swatch]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTheme(key)}
                  title={swatch.description}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    theme === key
                      ? "border-neutral-900 dark:border-white"
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
              <span className="mx-1 text-neutral-300 dark:text-neutral-700">|</span>
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
            </div>
          )}

          {spec && (
            <div className="pt-3">
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void applyEdit();
                }}
              >
                <input
                  value={editPrompt}
                  onChange={(event) => setEditPrompt(event.target.value)}
                  placeholder={t.editPlaceholder}
                  className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] outline-none focus:border-neutral-600 dark:border-neutral-700 dark:bg-neutral-800"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-400 px-3 py-1.5 text-[13px] dark:border-neutral-600"
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
            <div className="pt-3 font-mono text-[12px] text-neutral-500">
              {status}
              {totalTokens > 0 && ` · ${totalTokens} tok · ${steps.length} evals`}
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
            <JSONUIProvider
              key={`${renderKey.current}-${theme}`}
              registry={registry}
              initialState={spec.state ?? {}}
            >
              <Renderer spec={themedSpec!} registry={registry} />
            </JSONUIProvider>
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
