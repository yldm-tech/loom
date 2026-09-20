import {
  ARCHETYPES,
  SLOTS,
  SLOT_ORDER,
  layoutRules,
  type ArchetypeKey,
  type SlotKey,
} from "@/lib/plan";
import { elementsFor, type SiteContent } from "@/lib/content";
import { THEME_CRITERIA } from "@/lib/themes";
import {
  asSettled,
  contextFrom,
  generateChunk,
  generateIdentity,
  isReady,
  type ChunkName,
} from "@/lib/content-parallel";

type Answer = { choice: string; confidence?: number; noul?: number };

/** Skeleton shape per slot, so the placeholder occupies the real block's space. */
const SKELETON_KIND: Record<string, string> = {
  nav: "nav",
  hero: "hero",
  social: "testimonials",
  features: "features",
  pricing: "pricing",
  faq: "faq",
  cta: "cta",
  footer: "footer",
};

async function ask(
  apiKey: string,
  questions: Record<string, unknown>,
  signal: AbortSignal,
  state: Record<string, unknown> = {},
) {
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state, model: "jev-latest", questions }),
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`TypeSafe ${response.status}: ${await response.text()}`);
  return (await response.json()) as {
    answers: Record<string, Answer>;
    usage?: { input_tokens?: number };
  };
}

/**
 * Three layers, overlapped.
 *
 *   Layer 0 (LLM)  writes the copy. Jev cannot invent a word of it.
 *   Layer 1 (jev)  picks the page archetype; required slots are structural.
 *   Layer 2 (jev)  picks one variant per slot from a mutually exclusive set.
 *
 * Layers 1 and 2 depend only on the user's request, never on the copy, so they
 * run concurrently with generation and the page paints as soon as the identity
 * chunk lands rather than after everything finishes.
 */
export async function* composePlanned(
  apiKey: string,
  llmKey: string,
  prompt: string,
  signal: AbortSignal,
) {
  let inputTokens = 0;
  let outputTokens = 0;
  const started = Date.now();

  // Copy generation and planning start together.
  const identityPromise = generateIdentity(llmKey, prompt, signal);

  const round1: Record<string, unknown> = {
    archetype: {
      type: "choice",
      instructions: { role: "判断用户想要的是哪一种页面", request: prompt },
      criteria: Object.fromEntries(
        Object.entries(ARCHETYPES).map(([key, a]) => [key, a.description]),
      ),
    },
  };
  round1.theme = {
    type: "choice",
    instructions: {
      role: "为这个业务挑一套视觉主题",
      request: prompt,
      note: "按业务的气质和目标客户选，不要按个人偏好",
    },
    criteria: THEME_CRITERIA,
  };
  for (const slot of Object.keys(SLOTS) as SlotKey[]) {
    round1[`want_${slot}`] = {
      type: "noul",
      instructions: {
        role: "判断这个页面是否需要该区块",
        request: prompt,
        block: SLOTS[slot].question,
      },
      criteria: {
        true: "这个页面应该有它",
        false: "这个页面不需要它，加上反而累赘",
      },
    };
  }

  const first = await ask(apiKey, round1, signal);
  inputTokens += first.usage?.input_tokens ?? 0;

  const themeKey = first.answers.theme?.choice ?? "forest";
  const themeConfidence = first.answers.theme?.confidence ?? null;
  const archetypeKey = (first.answers.archetype?.choice ?? "landing") as ArchetypeKey;
  const archetype = ARCHETYPES[archetypeKey] ?? ARCHETYPES.landing;

  const chosen = new Set<SlotKey>(archetype.required as readonly SlotKey[]);
  const wants: Record<string, number> = {};
  for (const slot of archetype.optional as readonly SlotKey[]) {
    const noul = first.answers[`want_${slot}`]?.noul ?? 0;
    wants[slot] = noul;
    if (noul >= 0.5) chosen.add(slot);
  }

  yield {
    type: "plan",
    archetype: archetypeKey,
    archetypeLabel: archetype.label,
    confidence: first.answers.archetype?.confidence ?? null,
    theme: themeKey,
    themeConfidence,
    required: archetype.required,
    optional: wants,
    slots: [...chosen],
    inputTokens,
    elapsedMs: Date.now() - started,
  };

  // Variant selection also needs only the request, so it goes out immediately.
  // A slot only reaches jev when its variants are a genuine judgement. Anything
  // derivable from the generated content is decided by layoutRules() instead.
  const multi = [...chosen].filter(
    (slot) =>
      Object.keys(SLOTS[slot].variants).length > 1 &&
      !(SLOTS[slot] as { auto?: boolean }).auto,
  );
  const picks: Record<string, string> = {};
  for (const slot of chosen) {
    const variants = Object.keys(SLOTS[slot].variants);
    if (variants.length === 1) picks[slot] = variants[0]!;
  }
  const selectPromise =
    multi.length > 0
      ? ask(
          apiKey,
          Object.fromEntries(
            multi.map((slot) => [
              slot,
              {
                type: "choice",
                instructions: {
                  role: "为这个槽位挑出唯一合适的变体",
                  request: prompt,
                  slot: SLOTS[slot].question,
                },
                criteria: SLOTS[slot].variants,
              },
            ]),
          ),
          signal,
        )
      : null;

  let content: Partial<SiteContent> = {};
  let elements: Record<string, { type: string; props?: Record<string, unknown> }> = {};

  const buildSpec = () => {
    const specElements: Record<string, unknown> = {
      root: { type: "Page", props: { theme: themeKey }, children: [] as string[] },
    };
    const children: string[] = [];
    for (const slot of SLOT_ORDER) {
      if (!chosen.has(slot)) continue;
      const key = `slot_${slot}`;
      const id = picks[slot];
      const element = id ? elements[id] : undefined;
      // The frame is drawn from the plan alone; a block that has no copy yet
      // holds its place with a skeleton of the same shape.
      const ready = element && isReady(id!, content);
      specElements[key] = ready
        ? { ...element, children: [] }
        : { type: "Skeleton", props: { kind: SKELETON_KIND[slot] ?? "section" }, children: [] };
      children.push(key);
    }
    (specElements.root as { children: string[] }).children = children;
    return {
      spec: { root: "root", elements: specElements, state: {} },
      count: children.length,
    };
  };

  // The frame goes up immediately: correct blocks, correct order, correct
  // theme, all skeletons. Nothing here waits on the LLM.
  {
    const { spec } = buildSpec();
    yield { type: "partial", phase: "frame", spec, elapsedMs: Date.now() - started };
  }

  // Identity lands first: enough for a nav, a hero and a footer.
  {
    const identity = await identityPromise;
    outputTokens += identity.outputTokens;
    content = { ...content, ...(identity.parsed as Partial<SiteContent>) };
    elements = elementsFor(content as SiteContent);

    const identityRules = layoutRules(content).filter((rule) => chosen.has(rule.slot));
    for (const rule of identityRules) picks[rule.slot] = rule.id;

    yield {
      type: "content",
      phase: "identity",
      rules: identityRules.map((rule) => `${rule.slot}=${rule.id}（${rule.because}）`),
      brand: content.brand,
      tagline: content.tagline,
      heroTitle: content.heroTitle,
      outputTokens,
      elapsedMs: Date.now() - started,
    };
  }

  if (selectPromise) {
    const second = await selectPromise;
    inputTokens += second.usage?.input_tokens ?? 0;
    const detail: Record<string, { choice: string; confidence?: number }> = {};
    for (const slot of multi) {
      const answer = second.answers[slot];
      if (answer) {
        picks[slot] = answer.choice;
        detail[slot] = { choice: answer.choice, confidence: answer.confidence };
      }
    }
    yield {
      type: "select",
      picks: detail,
      inputTokens,
      elapsedMs: Date.now() - started,
    };
  }

  // First paint: whatever the identity chunk already supports.
  {
    const { spec, count } = buildSpec();
    if (count > 0)
      yield { type: "partial", phase: "identity", spec, elapsedMs: Date.now() - started };
  }

  // Remaining chunks stream in as they finish, in completion order.
  {
    const context = contextFrom(prompt, content as Record<string, unknown>);
    const names: ChunkName[] = ["features", "commerce", "social"];
    const jobs = names.map((name) =>
      generateChunk(llmKey, name, context, signal).then((result) => ({ name, result })),
    );
    for await (const { name, result } of asSettled(jobs)) {
      outputTokens += result.outputTokens;
      content = { ...content, ...(result.parsed as Partial<SiteContent>) };
      elements = elementsFor(content as SiteContent);

      const applied = layoutRules(content).filter((rule) => chosen.has(rule.slot));
      for (const rule of applied) picks[rule.slot] = rule.id;

      const { spec } = buildSpec();
      yield {
        type: "partial",
        phase: name,
        spec,
        rules: applied.map((rule) => `${rule.slot}=${rule.id}（${rule.because}）`),
        outputTokens,
        elapsedMs: Date.now() - started,
      };
      yield { type: "picks", picks: { ...picks }, content, elapsedMs: Date.now() - started };
    }
  }

  yield { type: "picks", picks: { ...picks }, content, elapsedMs: Date.now() - started };

  const { spec, count } = buildSpec();
  yield {
    type: "complete",
    stopReason: count > 0 ? "finish" : "unavailable",
    spec,
    inputTokens,
    outputTokens,
    elapsedMs: Date.now() - started,
  };
}
