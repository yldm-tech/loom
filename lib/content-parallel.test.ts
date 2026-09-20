import { afterEach, describe, expect, it, vi } from "vitest";
import { asSettled, generateChunk, isReady, SLOT_NEEDS, type Settled } from "./content-parallel";
import { SLOTS } from "./plan";
import type { SiteContent } from "./content";

describe("isReady", () => {
  it("holds a block back until every field it renders has arrived", () => {
    expect(isReady("nav_standard", { brand: "某某" })).toBe(false);
    expect(
      isReady("nav_standard", {
        brand: "某某",
        navLinks: ["一", "二"],
        primaryCta: "了解",
      } as Partial<SiteContent>),
    ).toBe(true);
  });

  it("treats an empty array as missing, not as present", () => {
    expect(
      isReady("nav_standard", {
        brand: "某某",
        navLinks: [],
        primaryCta: "了解",
      } as Partial<SiteContent>),
    ).toBe(false);
  });

  it("lets the minimal nav through without links, because it renders none", () => {
    expect(isReady("nav_minimal", { brand: "某某", primaryCta: "了解" })).toBe(true);
  });

  it("rejects a null field, because valid JSON carries it past both retries and it throws in the renderer instead", () => {
    expect(
      isReady("contact", {
        contactTitle: "找我们",
        address: "示例路 1 号",
        hours: "10:00-19:00",
        contactLabels: null,
      } as unknown as Partial<SiteContent>),
    ).toBe(false);
  });

  it("rejects a blank string, because a button whose label is empty renders as an unlabelled button", () => {
    expect(
      isReady("hero_centered", {
        heroTitle: "标题",
        heroSubtitle: "副标题",
        tagline: "定位",
        primaryCta: "开始",
        secondaryCta: "   ",
      } as Partial<SiteContent>),
    ).toBe(false);
  });

  it("refuses a variant it knows nothing about", () => {
    expect(isReady("nav_does_not_exist", { brand: "某某" })).toBe(false);
  });

  it("declares needs for every variant a slot can resolve to", () => {
    for (const [name, slot] of Object.entries(SLOTS)) {
      for (const variant of Object.keys(slot.variants)) {
        expect(SLOT_NEEDS[variant], `${name} → ${variant} has no declared needs`).toBeDefined();
      }
    }
  });
});

describe("asSettled", () => {
  /** Only the fulfilled values, so the ordering and draining invariants read the way they did before this helper reported failures too. */
  const fulfilled = <T>(settled: Settled<T>) => {
    if (settled.status !== "fulfilled") throw new Error("expected a fulfilled outcome");
    return settled.value;
  };

  it("yields in completion order, not call order", async () => {
    const delayed = <T>(value: T, ms: number) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

    const seen: string[] = [];
    for await (const settled of asSettled([
      delayed("slow", 40),
      delayed("fast", 5),
      delayed("middle", 20),
    ])) {
      seen.push(fulfilled(settled));
    }
    expect(seen).toEqual(["fast", "middle", "slow"]);
  });

  it("drains everything exactly once", async () => {
    const values: number[] = [];
    for await (const settled of asSettled([1, 2, 3, 4].map((n) => Promise.resolve(n)))) {
      values.push(fulfilled(settled));
    }
    expect([...values].sort()).toEqual([1, 2, 3, 4]);
  });

  it("ends immediately when given nothing to wait for", async () => {
    const values: unknown[] = [];
    for await (const value of asSettled([])) values.push(value);
    expect(values).toEqual([]);
  });

  it("reports a rejection as an outcome and keeps draining, so one failed chunk cannot discard the copy that already landed", async () => {
    const boom = new Error("两次都没拿到合法 JSON");
    const seen: string[] = [];
    for await (const settled of asSettled([
      Promise.resolve("a"),
      Promise.reject(boom),
      Promise.resolve("c"),
    ])) {
      seen.push(settled.status === "fulfilled" ? settled.value : `rejected:${(settled.reason as Error).message}`);
    }
    expect([...seen].sort()).toEqual(["a", "c", "rejected:两次都没拿到合法 JSON"]);
  });

  it("attaches its handlers before it returns, so a rejection that lands before the caller starts iterating is not an unhandled rejection", async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", record);
    try {
      const outcomes = asSettled([Promise.reject(new Error("jev 500"))]);
      // The gap the old generator left open: everything the caller does between constructing the iterator and pulling from it.
      await new Promise((resolve) => setTimeout(resolve, 10));
      const seen: Settled<never>[] = [];
      for await (const settled of outcomes) seen.push(settled);
      expect(seen).toHaveLength(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
    }
  });
});

describe("retrying a truncated answer", () => {
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
  });

  const signal = new AbortController().signal;

  /** Records what was asked for, and answers the first attempt with an object the token cap cut in half. */
  function truncateOnce(finishReason: string) {
    const sent: { max_tokens: number; messages: { role: string; content: string }[] }[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      sent.push(body);
      const first = sent.length === 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                // Cut after a complete nested item, which is what truncation actually looks like: `lastIndexOf("}")` finds that inner brace and JSON.parse fails on the unbalanced rest.
                content: first
                  ? '{"galleryTitle":"店里","gallery":[{"title":"吧台","note":"六个座位"},{"title":"手冲台","note":"看得到'
                  : '{"galleryTitle":"店里"}',
              },
              finish_reason: first ? finishReason : "stop",
            },
          ],
          usage: { completion_tokens: 100 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    return sent;
  }

  it("raises the cap the second time, because re-sending the budget the answer just overran cuts it in the same place", async () => {
    const sent = truncateOnce("length");
    await generateChunk("k", "place", "一家咖啡馆", signal);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.max_tokens).toBeGreaterThan(sent[0]!.max_tokens);
  });

  it("tells the model it ran out of room rather than quoting a parse error it cannot act on", async () => {
    const sent = truncateOnce("length");
    await generateChunk("k", "place", "一家咖啡馆", signal);
    const retry = sent[1]!.messages.at(-1)!.content;
    expect(retry).toContain("截断");
    expect(retry).not.toMatch(/Unexpected|JSON\.parse/);
  });

  it("leaves the budget alone when the answer was malformed for some other reason, so a fenced or chatty reply does not buy tokens it will not use", async () => {
    const sent = truncateOnce("stop");
    await generateChunk("k", "place", "一家咖啡馆", signal);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.max_tokens).toBe(sent[0]!.max_tokens);
  });
});
