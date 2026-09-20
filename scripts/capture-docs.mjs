#!/usr/bin/env node
/**
 * Re-captures the README images from a demo-mode server.
 *
 * Like the fixtures, these are generated artefacts that were produced by hand
 * once and then went stale silently — three of them showed German and French
 * testimonials wrapped in Japanese quotation marks long after that was fixed.
 * Each language gets its own set, captured with the UI in that locale.
 *
 *   npm run capture            all locales
 *   npm run capture -- de fr   just these
 *
 * Needs a demo-mode server (no keys) and ffmpeg on PATH.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const run = promisify(execFile);
const BASE = process.env.CAPTURE_BASE_URL ?? "http://127.0.0.1:3300";
const OUT = "docs/images";

/**
 * GitHub caches README images by URL, so a re-capture under the same name can
 * keep serving the old picture for hours. Bump this and the filenames change,
 * which is the only reliable cache bust; a test keeps the eight READMEs on the
 * same generation.
 */
const GEN = "2";
/**
 * The run is over when the button goes idle again. A blockquote is not a
 * signal: the skeletons render one long before any copy arrives.
 */
const DONE = '[data-loom=generate][data-running="0"]';

/** How much of the site a theme tile shows: nav, hero and the start of the next block. */
const TILE_HEIGHT = 940;

/** The prompt each locale's fixture was recorded from. */
const PROMPTS = {
  en: "a small ceramics studio in Kyoto that runs weekend workshops",
  zh: "杭州一家做手冲咖啡的小店，想要一个简单的介绍页",
  ja: "京都で週末に陶芸教室をひらく小さな工房のサイトがほしい",
  ko: "서울에서 주말 도자기 공방을 운영하는 작은 스튜디오 소개 페이지",
  es: "un pequeño estudio de cerámica en Valencia con talleres de fin de semana",
  fr: "une petite boulangerie qui vend du pain au levain et des pâtisseries",
  de: "eine kleine Keramikwerkstatt in Leipzig mit Wochenendkursen",
  pt: "um pequeno ateliê de cerâmica no Porto com oficinas de fim de semana",
};

/** Runs one generation and waits for the last block to land. */
async function generate(page, prompt) {
  await page.fill("form input", prompt);
  await page.press("form input", "Enter");
  await page.waitForSelector(DONE, { timeout: 90_000 });
  await page.waitForTimeout(1200);
}

/**
 * The generation, as an animated WebP. A GIF at this size destroys CJK text —
 * 40 colours and 5 fps turned the decision log into mush — so the frames are
 * encoded individually with cwebp and stitched with webpmux. ffmpeg on macOS
 * ships without a WebP encoder, so it is not an option here.
 *
 * Frames are captured at 1x: a 2x shot of a 1280px viewport takes longer than
 * the frame interval, which silently drops the run to a handful of frames.
 */
async function captureGenerate(browser, locale, tmp) {
  const context = await browser.newContext({ locale, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.fill("form input", PROMPTS[locale]);

  const settled = page
    .press("form input", "Enter")
    .then(() => page.waitForSelector(DONE, { timeout: 90_000 }).catch(() => {}))
    .then(() => page.waitForTimeout(2000));

  let running = true;
  void settled.then(() => {
    running = false;
  });

  const frames = [];
  const INTERVAL = 500;
  while (running && frames.length < 60) {
    const started = Date.now();
    const file = join(tmp, `f${String(frames.length).padStart(3, "0")}.png`);
    await page.screenshot({ path: file });
    frames.push(file);
    const left = INTERVAL - (Date.now() - started);
    if (left > 0) await page.waitForTimeout(left);
  }
  await settled;
  await page.close();
  await context.close();

  const encoded = [];
  for (const frame of frames) {
    const webp = `${frame}.webp`;
    await run("magick", [frame, "-resize", "760x", "-unsharp", "0x0.6+0.6+0.02", `png:${webp}.png`]);
    await run("cwebp", ["-q", "62", "-m", "6", "-sharp_yuv", "-quiet", `${webp}.png`, "-o", webp]);
    encoded.push(webp);
  }
  const args = [];
  for (const webp of encoded) args.push("-frame", webp, `+${INTERVAL}+0+0+1+b`);
  args.push("-loop", "0", "-bgcolor", "255,255,255,255", "-o", join(OUT, `generate-${locale}-${GEN}.webp`));
  await run("webpmux", args);
  return frames.length;
}

/** The decision log: the control panel on its own, where every number lives. */
async function captureDecisions(context, locale, tmp) {
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await generate(page, PROMPTS[locale]);
  const panel = page.locator("[data-loom=panel]");
  const shot = join(tmp, "panel.png");
  await panel.screenshot({ path: shot });
  await page.close();
  await run("magick", [
    shot, "-resize", "1680x", "-unsharp", "0x0.6+0.6+0.02",
    "-quality", "90", join(OUT, `decisions-${locale}-${GEN}.jpg`),
  ]);
}

/** Six themes over the same content, tiled three across. */
async function captureThemes(context, locale, tmp) {
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await generate(page, PROMPTS[locale]);
  await page.locator("[data-loom=site]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  // Read the keys off the page rather than listing them here: a hardcoded list
  // drifts the moment a theme is renamed, and the UI labels are localised.
  const themes = await page.$$eval("[data-theme-key]", (nodes) =>
    nodes.map((n) => n.getAttribute("data-theme-key")),
  );
  if (themes.length === 0) throw new Error("no theme buttons on the page");

  const tiles = [];
  for (const theme of themes) {
    await page.click(`[data-theme-key="${theme}"]`);
    await page.waitForTimeout(600);
    // Clip relative to the site itself: the control panel above it changes
    // height with the locale, so a fixed page offset crops a different band
    // in every language.
    const box = await page.locator("[data-loom=site]").boundingBox();
    if (!box) throw new Error("the rendered site has no box");
    const tile = join(tmp, `t-${theme}.png`);
    // fullPage, because the crop is taller than the viewport.
    await page.screenshot({
      path: tile,
      fullPage: true,
      clip: { x: box.x, y: box.y, width: box.width, height: Math.min(TILE_HEIGHT, box.height) },
    });
    tiles.push(tile);
  }
  await page.close();

  // Tiled with append rather than montage: montage wants a font for its labels
  // and fails on a headless box that has none, even with labels turned off.
  const rows = [];
  for (let i = 0; i < tiles.length; i += 3) {
    const row = join(tmp, `row-${i}.png`);
    await run("magick", [...tiles.slice(i, i + 3), "+append", row]);
    rows.push(row);
  }
  await run("magick", [
    ...rows, "-append", "-resize", "1680x", "-unsharp", "0x0.6+0.6+0.02",
    "-quality", "88", join(OUT, `themes-${locale}-${GEN}.jpg`),
  ]);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const locales = wanted.length ? wanted : Object.keys(PROMPTS);

const browser = await chromium.launch();
let failures = 0;
try {
  for (const locale of locales) {
    if (!PROMPTS[locale]) {
      console.error(`  ${locale}: no prompt defined`);
      failures += 1;
      continue;
    }
    const tmp = await mkdtemp(join(tmpdir(), `loom-${locale}-`));
    const context = await browser.newContext({
      locale,
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });
    try {
      const frames = await captureGenerate(browser, locale, tmp);
      await captureDecisions(context, locale, tmp);
      await captureThemes(context, locale, tmp);
      console.log(`  ${locale}: ${frames} frames, 3 images`);
    } catch (error) {
      console.error(`  ${locale}: ${error.message}`);
      failures += 1;
    } finally {
      await context.close();
      await rm(tmp, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
