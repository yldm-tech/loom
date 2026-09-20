#!/usr/bin/env node
/**
 * Accessibility audit of the generated output, across every theme.
 *
 * The unit tests check contrast from the token values, which is fast and runs
 * in CI. This checks what a browser actually renders — landmarks, names,
 * heading order, computed contrast — and needs a running server, so it stays a
 * script you invoke rather than part of `npm test`.
 *
 *   npm run dev            # demo mode is enough; no keys needed
 *   node scripts/audit-a11y.mjs [url]
 */
import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3200/";
const AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";
const THEMES = ["forest", "corporate", "warm", "ink", "terminal", "coral"];

const axe = await fetch(AXE).then((r) => {
  if (!r.ok) throw new Error(`could not fetch axe-core: HTTP ${r.status}`);
  return r.text();
});

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  // The npm package ships without browser binaries, and the stock error is a
  // wall of ASCII art. Say the one command that fixes it.
  if (/Executable doesn't exist|npx playwright install/.test(String(error))) {
    console.error("Chromium is not installed for Playwright. Run:\n\n  npx playwright install chromium\n");
    process.exit(1);
  }
  throw error;
}
let failures = 0;
try {
  const page = await browser.newPage({
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
  });
  try {
    await page.goto(URL, { waitUntil: "networkidle" });
  } catch {
    console.error(`Nothing is serving ${URL}. Start it first:\n\n  npm run dev\n`);
    process.exit(1);
  }
  await page.fill("input[placeholder]", "Enterprise data compliance SaaS for financial institutions");
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => document.body.innerText.includes("finish"), { timeout: 150_000 });
  await page.waitForTimeout(1200);
  await page.addScriptTag({ content: axe });

  for (const [index, theme] of THEMES.entries()) {
    await page.evaluate((i) => {
      const pills = [...document.querySelectorAll("button")].filter((b) =>
        b.querySelector("span.rounded-full"),
      );
      pills[i]?.click();
    }, index);
    await page.waitForTimeout(500);

    // Scoped to the generated site: the editor around it is not the product.
    const violations = await page.evaluate(async () => {
      const frame = document.querySelector("div.overflow-hidden.rounded-xl");
      const result = await globalThis.axe.run(frame, { resultTypes: ["violations"] });
      return result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        sample: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 120)),
      }));
    });

    if (violations.length === 0) {
      console.log(`  ✓ ${theme}`);
      continue;
    }
    failures += violations.reduce((sum, v) => sum + v.nodes, 0);
    console.log(`  ✗ ${theme}`);
    for (const v of violations) {
      console.log(`      [${v.impact}] ${v.id} ×${v.nodes} — ${v.help}`);
      for (const s of v.sample) console.log(`        ${s}`);
    }
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nNo violations." : `\n${failures} violating nodes.`);
process.exit(failures === 0 ? 0 : 1);
