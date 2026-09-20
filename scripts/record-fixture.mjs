#!/usr/bin/env node
/**
 * Re-records the demo fixtures against a running server with live keys.
 *
 * The fixtures are real runs, so they go stale when the system changes — three
 * of them were recorded while the copy layer still drifted back to Chinese, and
 * nothing noticed because nobody could regenerate them. The prompts live here
 * so a recording is reproducible, and the script refuses to write a run whose
 * output is not actually in the language it claims.
 *
 *   npm run record            all locales
 *   npm run record -- fr de   just these
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.RECORD_BASE_URL ?? "http://127.0.0.1:3200";

/** One prompt per locale, in that locale where the language follows the script. */
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

/** Scripts that must not appear in a locale's output. Latin locales get all three. */
const FORBIDDEN = {
  en: [/[一-鿿]/u, /[぀-ヿ]/u, /[가-힯]/u],
  es: [/[一-鿿]/u, /[぀-ヿ]/u, /[가-힯]/u],
  fr: [/[一-鿿]/u, /[぀-ヿ]/u, /[가-힯]/u],
  de: [/[一-鿿]/u, /[぀-ヿ]/u, /[가-힯]/u],
  pt: [/[一-鿿]/u, /[぀-ヿ]/u, /[가-힯]/u],
  ko: [/[぀-ヿ]/u],
  ja: [/[가-힯]/u],
  zh: [/[぀-ヿ]/u, /[가-힯]/u],
};

async function record(locale) {
  const response = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: PROMPTS[locale], locale }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${BASE}`);
  if (response.headers.get("X-Loom-Mode") !== "live") {
    throw new Error("server is in demo mode; set JEV_TOKEN and LLM_TOKEN and restart it");
  }

  const text = await response.text();
  const events = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

  const failed = events.find((e) => e.type === "error");
  if (failed) throw new Error(`run failed: ${failed.message}`);
  const plan = events.find((e) => e.type === "plan");
  const complete = events.find((e) => e.type === "complete");
  if (!plan || !complete) throw new Error("run produced no plan or never completed");
  if (plan.language !== locale) {
    throw new Error(`asked for ${locale}, got ${plan.language} from ${plan.languageSource}`);
  }

  const body = JSON.stringify(complete.spec);
  for (const pattern of FORBIDDEN[locale]) {
    const hit = body.match(pattern);
    if (hit) throw new Error(`copy drifted out of ${locale}: found ${hit[0]}`);
  }

  await writeFile(join("fixtures", `${locale}.jsonl`), `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
  return { events: events.length, ms: complete.elapsedMs };
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const locales = wanted.length ? wanted : Object.keys(PROMPTS);
let failures = 0;
for (const locale of locales) {
  if (!PROMPTS[locale]) {
    console.error(`  ${locale}: no prompt defined`);
    failures += 1;
    continue;
  }
  try {
    const { events, ms } = await record(locale);
    console.log(`  ${locale}: ${events} events, ${(ms / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error(`  ${locale}: ${error.message}`);
    failures += 1;
  }
}
process.exit(failures ? 1 : 0);
