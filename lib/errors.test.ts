import { afterEach, describe, expect, it, vi } from "vitest";
import { generateIdentity } from "./content-parallel";

/**
 * `fetch()` reports every transport problem as "fetch failed", which tells a
 * reader nothing about which of the two services is down or which environment
 * variable to look at. These check that the wrapper says both.
 */
const real = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = real;
  vi.unstubAllEnvs();
});

const signal = new AbortController().signal;

/** Returns the rejection, and fails loudly if there wasn't one. */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected a rejection, got a value");
}

describe("copy layer errors", () => {
  it("names the endpoint and the variable when the host is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(generateIdentity("k", "a shop", signal)).rejects.toThrow(
      /Could not reach the copy model at http.*LLM_BASE_URL/s,
    );
  });

  it("points at the token for 401 and 403, not at the URL", async () => {
    for (const status of [401, 403]) {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response("nope", { status }),
      );
      await expect(generateIdentity("k", "a shop", signal)).rejects.toThrow(
        new RegExp(`HTTP ${status}\\..*LLM_TOKEN`, "s"),
      );
    }
  });

  it("points at the URL and model for 404, not at the token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const error = await rejection(generateIdentity("k", "a shop", signal));
    expect(error.message).toMatch(/LLM_BASE_URL and LLM_MODEL/);
    expect(error.message).not.toMatch(/LLM_TOKEN/);
  });

  it("includes the server's own words, truncated", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("x".repeat(500), { status: 500 }),
    );
    const error = await rejection(generateIdentity("k", "a shop", signal));
    expect(error.message).toContain("HTTP 500");
    expect(error.message.length).toBeLessThan(320);
  });

  it("does not dress up a deliberate abort as a connectivity problem", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("aborted", "AbortError"));
    globalThis.fetch = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    const error = await rejection(generateIdentity("k", "a shop", controller.signal));
    expect(error.message).not.toMatch(/Could not reach/);
  });

  it("retries a malformed body before giving up", async () => {
    const ok = (text: string) =>
      new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok("not json at all"))
      .mockResolvedValueOnce(ok('{"brand":"Acme"}'));
    globalThis.fetch = fetchMock;
    const result = await generateIdentity("k", "a shop", signal);
    expect(result.parsed.brand).toBe("Acme");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the second attempt rather than looping", async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "still not json" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    globalThis.fetch = fetchMock;
    await expect(generateIdentity("k", "a shop", signal)).rejects.toThrow(/JSON/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
