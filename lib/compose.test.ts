import { afterEach, describe, expect, it, vi } from "vitest";
import { composePlanned } from "./compose";
import { catalog } from "./catalog";

/**
 * The orchestration seam had no test, and three of the audit's findings lived in it: a copy chunk that failed both its attempts took the whole page down, a Jev round that rejected while the identity chunk was still in flight became an unhandled rejection, and an auto slot that layoutRules never spoke for stayed a skeleton through to `complete` while the run still reported `finish`.
 *
 * Both transports are stubbed at `fetch`, so nothing here touches the network and the whole file runs in milliseconds. The Jev stand-in answers every question with its first criterion, which is enough to fix an archetype and a theme deterministically; the copy stand-in is told per chunk what to return, including how to fail.
 */

const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
});

type ChunkName = "identity" | "features" | "commerce" | "place" | "social";

/** Which chunk a request is, read off the schema in its system turn — the same way a reader would tell them apart. */
const MARKER: Record<ChunkName, string> = {
  identity: '"brand"',
  features: '"featuresTitle"',
  commerce: '"pricingTitle"',
  place: '"galleryTitle"',
  social: '"testimonialsTitle"',
};

const IDENTITY = {
  brand: "青石",
  tagline: "城东的手冲咖啡",
  heroTitle: "每天现烘的豆子",
  heroSubtitle: "小批量烘焙，当天出杯，豆单每周轮换。",
  heroBullets: ["当日烘焙", "单一产区", "自带杯减五元"],
  primaryCta: "看豆单",
  secondaryCta: "找过来",
  navLinks: ["豆单", "空间", "课程", "关于"],
  footerColumns: ["豆单", "空间", "课程", "关于"],
  footerNote: "青石咖啡 · 城东",
  visualKind: "scene",
};

const FEATURES = {
  featuresTitle: "我们怎么做咖啡",
  features: [{ icon: "◈", title: "当日烘焙", body: "每天早上烘完，下午就进磨豆机。" }],
  featuresDeep: [{ title: "当日烘焙", body: "烘好的豆子在第三天风味最稳，我们按这个节奏排烘焙表。" }],
};

const COMMERCE = {
  pricingTitle: "价目",
  pricingCta: "来一杯",
  tiers: [
    { name: "手冲", price: "38", period: "每杯", features: ["单一产区", "可带走"], highlighted: true },
  ],
};

const SOCIAL = {
  testimonialsTitle: "客人说",
  testimonials: [{ quote: "豆子新鲜，坐一下午也没人赶。", name: "林", role: "常客" }],
  faqTitle: "常见问题",
  faq: [{ q: "有位子吗？", a: "工作日下午通常有，周末建议早点来。" }],
  ctaTitle: "明天早上八点开门",
  ctaBody: "带上自己的杯子，减五元。",
};

const PLACE = {
  galleryTitle: "店里",
  galleryCaption: "常在店里的几样东西",
  gallery: [{ title: "吧台", note: "六个座位，看得到手冲。" }],
  stepsTitle: "第一次来",
  steps: [{ title: "先看豆单", body: "豆单在门口黑板上，每周换一次。" }],
  contactTitle: "找过来",
  address: "示例区示例路 1 号",
  hours: "08:00-19:00",
  phone: "000-0000-0000",
  contactNote: "门口可停两辆自行车。",
  contactLabels: { address: "地址", hours: "营业时间", phone: "电话" },
  teamTitle: "店里的人",
  team: [{ name: "林", role: "烘豆师", bio: "烘了六年豆子，每天五点到店。" }],
};

const DEFAULT_COPY: Record<ChunkName, unknown> = {
  identity: IDENTITY,
  features: FEATURES,
  commerce: COMMERCE,
  place: PLACE,
  social: SOCIAL,
};

type Event = Record<string, unknown>;
type SpecElement = { type: string; props?: Record<string, unknown> };
type Spec = { root: string; elements: Record<string, SpecElement> };

/** `null` for a chunk means the model answers with prose instead of JSON, on both attempts, which is what `两次都没拿到合法 JSON` is. */
async function run(options: {
  copy?: Partial<Record<ChunkName, unknown | null>>;
  wants?: Record<string, number>;
  secondJevRound?: "ok" | "500";
  abortOn?: ChunkName;
} = {}) {
  const copy = { ...DEFAULT_COPY, ...options.copy };
  const wants = options.wants ?? {};
  const controller = new AbortController();
  const calls: ChunkName[] = [];
  let jevRounds = 0;
  const unhandled: unknown[] = [];
  const record = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", record);

  const json = (payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    const sent = JSON.parse(init.body as string);
    if (String(url).includes("typesafe.ai")) {
      jevRounds += 1;
      if (jevRounds > 1 && options.secondJevRound === "500") {
        return new Response("upstream is down", { status: 500 });
      }
      const questions = sent.questions as Record<string, { criteria?: Record<string, string> }>;
      const answers: Record<string, unknown> = {};
      for (const [key, question] of Object.entries(questions)) {
        const slot = key.startsWith("want_") ? key.slice("want_".length) : null;
        answers[key] = {
          choice: Object.keys(question.criteria ?? {})[0] ?? "",
          confidence: 0.9,
          noul: slot ? (wants[slot] ?? 0) : 0,
        };
      }
      return json({ answers, usage: { input_tokens: 10 } });
    }
    const system = (sent.messages as { role: string; content: string }[]).find(
      (message) => message.role === "system",
    )!.content;
    const name = (Object.keys(MARKER) as ChunkName[]).find((chunk) =>
      system.includes(MARKER[chunk]),
    )!;
    calls.push(name);
    if (name === options.abortOn) {
      // What the 110-second timeout in the route does to a request already in flight.
      controller.abort(new DOMException("aborted", "AbortError"));
      throw new DOMException("aborted", "AbortError");
    }
    const answer = copy[name];
    return json({
      choices: [{ message: { content: answer === null ? "抱歉，我先说明一下：" : JSON.stringify(answer) } }],
      usage: { completion_tokens: 100 },
    });
  });

  const events: Event[] = [];
  let threw: unknown = null;
  try {
    for await (const event of composePlanned(
      "jev-key",
      "llm-key",
      "a coffee bar on the east side",
      controller.signal,
      "en",
    )) {
      events.push(event as Event);
    }
  } catch (error) {
    threw = error;
  }
  // Give a rejection created but never awaited a turn to surface before the listener comes off.
  await new Promise((resolve) => setTimeout(resolve, 10));
  process.off("unhandledRejection", record);

  const complete = events.find((event) => event.type === "complete");
  return {
    events,
    calls,
    threw,
    unhandled,
    complete,
    spec: complete?.spec as Spec | undefined,
    types: (name: string) => (complete!.spec as Spec).elements[name]?.type,
  };
}

/** Landing, with the optional blocks the three surviving chunks fill plus the gallery the failing one would have. */
const LANDING_WANTS = { social: 0.9, pricing: 0.9, faq: 0.9, gallery: 0.9 };

describe("composePlanned", () => {
  it("keeps every block the other chunks filled when one chunk fails both attempts, instead of ending the run", async () => {
    const { threw, unhandled, complete, types, events } = await run({
      copy: { place: null },
      wants: LANDING_WANTS,
    });

    expect(threw).toBeNull();
    expect(unhandled).toEqual([]);
    expect(complete).toBeDefined();
    expect(events.some((event) => event.type === "error")).toBe(false);

    // Everything the surviving chunks paid for is in the finished page.
    expect(types("slot_nav")).toBe("Nav");
    expect(types("slot_hero")).toBe("HeroCentered");
    expect(types("slot_features")).toBe("FeatureList");
    expect(types("slot_pricing")).toBe("Pricing");
    expect(types("slot_social")).toBe("Testimonials");
    expect(types("slot_faq")).toBe("FAQ");
    expect(types("slot_cta")).toBe("CTABand");
    expect(types("slot_footer")).toBe("Footer");
    // And only the failed chunk's block is missing, still holding its place.
    expect(types("slot_gallery")).toBe("Skeleton");
  });

  it("reports the failed chunk as a phase that produced no copy rather than as a new kind of event, so the stream's vocabulary is unchanged", async () => {
    const { events } = await run({ copy: { place: null }, wants: LANDING_WANTS });

    expect(new Set(events.map((event) => event.type))).toEqual(
      new Set(["plan", "partial", "content", "select", "picks", "complete"]),
    );
    const place = events.find((event) => event.type === "partial" && event.phase === "place");
    expect(place).toBeDefined();
    expect(place!.failed).toMatch(/JSON/);
    // The other three still report themselves as ordinary phases.
    expect(
      events.filter((event) => event.type === "partial" && event.failed === undefined).map((e) => e.phase),
    ).toEqual(expect.arrayContaining(["frame", "identity", "features", "commerce", "social"]));
  });

  it("still hands back a spec the catalog accepts and JSON can carry, which is what every export is built from", async () => {
    const { spec } = await run({ copy: { place: null }, wants: LANDING_WANTS });

    const roundTripped = JSON.parse(JSON.stringify(spec));
    expect(catalog.validate(roundTripped).success).toBe(true);
    const known = new Set(catalog.componentNames as readonly string[]);
    for (const element of Object.values(spec!.elements)) {
      expect(known.has(element.type), `${element.type} is not in the catalog`).toBe(true);
    }
  });

  it("spends both attempts on the failing chunk and no more, so one bad chunk cannot double the bill for the others", async () => {
    const { calls } = await run({ copy: { place: null }, wants: LANDING_WANTS });

    expect(calls.filter((name) => name === "place")).toHaveLength(2);
    for (const name of ["identity", "features", "commerce", "social"] as const) {
      expect(calls.filter((call) => call === name), name).toHaveLength(1);
    }
  });

  it("survives a variant round that fails after the request went out, which used to be an unhandled rejection rather than a caught one", async () => {
    const { threw, unhandled, events, types } = await run({
      secondJevRound: "500",
      wants: LANDING_WANTS,
    });

    expect(threw).toBeNull();
    expect(unhandled).toEqual([]);
    // No select line: the round produced nothing, and saying otherwise would be a lie in the decision log.
    expect(events.some((event) => event.type === "select")).toBe(false);
    // The page is still whole, because the variants it could not ask about resolve from the copy instead.
    expect(types("slot_nav")).toBe("Nav");
    expect(types("slot_social")).toBe("Testimonials");
    expect(types("slot_hero")).toBe("HeroCentered");
  });

  it("renders the hero even when the identity answer omits visualKind, because a required block with no layout rule used to stay a skeleton for the whole run", async () => {
    const withoutVisualKind = { ...IDENTITY, visualKind: undefined };
    const { types } = await run({ copy: { identity: withoutVisualKind }, wants: LANDING_WANTS });

    expect(types("slot_hero")).toBe("HeroCentered");
  });

  it("reports unavailable when nothing rendered, instead of calling a page of grey boxes a finish", async () => {
    const { complete, types } = await run({
      copy: { identity: { ok: true }, features: null, commerce: null, place: null, social: null },
      wants: LANDING_WANTS,
    });

    expect(types("slot_hero")).toBe("Skeleton");
    expect(complete!.stopReason).toBe("unavailable");
  });

  it("survives a chunk that answers a field with the wrong type, which is valid JSON and so never triggers a retry", async () => {
    // A free project priced as `"tiers": "免费"`. Every variant's props are built eagerly, so the string reached `.slice(...).map` in elementsFor and threw inside the generator — on pages that had no pricing block at all.
    const { threw, spec, types } = await run({
      copy: { commerce: { pricingTitle: "价目", pricingCta: "来一杯", tiers: "免费" } },
      wants: LANDING_WANTS,
    });

    expect(threw).toBeNull();
    expect(types("slot_hero")).toBe("HeroCentered");
    expect(types("slot_gallery")).toBe("Gallery");
    // The wrong-typed field never reaches the renderer as itself.
    expect(Array.isArray(spec!.elements.slot_pricing!.props!.tiers)).toBe(true);
  });

  it("ends the run when the signal is aborted rather than reporting each remaining chunk as a block that produced no copy", async () => {
    // Tolerating a failed chunk must not tolerate a cancelled run: after the route's 110-second timeout every chunk still in flight rejects, and the caller needs to hear that once, as a failure.
    const { threw, complete } = await run({ abortOn: "place", wants: LANDING_WANTS });

    expect(threw).toBeInstanceOf(DOMException);
    expect(complete).toBeUndefined();
  });

  it("reports finish when at least one block carries copy, so the two outcomes stay distinguishable", async () => {
    const { complete } = await run({ wants: LANDING_WANTS });

    expect(complete!.stopReason).toBe("finish");
  });
});
