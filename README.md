**English** · [简体中文](docs/README.zh.md) · [日本語](docs/README.ja.md) · [한국어](docs/README.ko.md)

# loom

<p align="center">
  <a href="https://github.com/yldm-tech/loom/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/yldm-tech/loom/ci.yml?branch=main&style=flat-square&label=ci"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/yldm-tech/loom?style=flat-square"></a>
  <a href="https://github.com/yldm-tech/loom/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/yldm-tech/loom?style=flat-square"></a>
  <a href="https://github.com/yldm-tech/loom/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/yldm-tech/loom?style=flat-square"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D24-brightgreen?style=flat-square">
  <a href="https://typesafe.ai"><img alt="Powered by Jev" src="https://img.shields.io/badge/judgement-Jev-5b8def?style=flat-square"></a>
</p>


> Three threads woven into one cloth: copy from an LLM, judgement from Jev, rules from code.

Describe your business in a sentence, get a landing page you can actually use.

<p align="center">
  <img src="docs/images/generate-en.webp" alt="Blocks filling into a themed skeleton as copy arrives" width="640">
</p>

```
"A specialty coffee shop in Brooklyn, pour-over only"

0.7s   full skeleton (blocks, order and palette already decided)
4.5s   hero and footer filled with real copy
13s    every block landed
```

The skeleton is themed from the first frame, because the plan lands before any copy does. Recorded in demo mode, so this is exactly what you see after `npm run dev` with no keys.

What sets this apart is not that AI builds a site. It is that **three layers each do only what they are good at**.

## Why three layers

A generative model will write anything, but you cannot guarantee the structure it emits is valid. A constrained model is always valid, but it cannot invent a single word. Use either alone, or blend them carelessly, and something collapses.

This project splits decisions by **where the information lives**:

| Layer | Owns | Because |
|---|---|---|
| **LLM** | Copy, plus facts about the business (how many selling points, how many price tiers, is there an interface to show) | None of this exists in the system; it can only be generated |
| **[Jev](https://typesafe.ai)** | Page archetype, visual theme, whether a block belongs, which kind of social proof | The answer is already in what the user said — it is a judgement |
| **Code** | Layout rules, block order, required blocks, readiness gating | These are rules; asking a model is the wrong move |

The test is simple: **persistently low confidence means you asked the wrong party** — either the input holds no answer, or the question needed no judgement at all.

That pattern showed up three times during development. Each time the fix was to replace the question with a factual one plus a code rule:

```
ask jev "grid or list for features?"      → 0.16  ← the request says nothing about it
have the LLM report "how many points?"    → code: >= 5 means grid        deterministic

ask jev "centered or split hero?"         → 0.28  ← same problem
have the LLM report "is there a UI shot?" → code: split only with a shot deterministic

ask jev "which visual theme?"             → 0.99  ← "playful", "financial clients" are right there
keep it                                                                  judgement
```

## Measured Jev behaviour

| Judgement | Confidence |
|---|---|
| Copy language (1 of 4) | 0.66 – 1.00 |
| Visual theme (1 of 6) | 0.98 – 1.00 |
| Page archetype (1 of 6) | 0.62 – 1.00 |
| Edit intent (1 of 6) | 0.98 – 1.00 |
| Kind of social proof (1 of 3) | 0.70 – 0.97 |

```
coffee shop     → local page@1.00   warm@0.99      → Nav HeroCentered Testimonials Gallery Pricing Contact FAQ Footer
photographer    → local page@0.62   ink@1.00       → Nav HeroCentered Testimonials Gallery Pricing Contact Footer
compliance SaaS → landing@1.00      corporate@1.00 → Nav HeroSplit Testimonials FeatureGrid Steps Pricing FAQ CTABand Footer
```

Every one is a **single mutually exclusive choice** — probabilities must sum to one, so a distractor can only win by taking mass from the right answer. Ask instead "one independent yes/no per candidate" and at 40 options roughly 5% of them leak in as false positives. That gap is structural, not something prompt wording fixes.

Jev costs about three calls, under a second, on the order of $0.001 per site. **The LLM writing copy is always the bottleneck.**

## Running it

You can run it without keys. `npm run dev` and open it — that is **demo mode**: a real recorded run replayed with its original streaming timing, and the UI says so plainly.

```bash
git clone https://github.com/yldm-tech/loom
cd loom
npm install
npm run dev          # demo mode, zero config
```

Add keys to generate for real:

```bash
cp .env.example .env.local   # fill in JEV_TOKEN and LLM_TOKEN
```

Get `JEV_TOKEN` from [typesafe.ai](https://typesafe.ai). `LLM_TOKEN` works with any OpenAI-compatible endpoint — OpenAI, OpenRouter, a gateway, a local llama.cpp server — just set `LLM_BASE_URL` and `LLM_MODEL`.

The files under `fixtures/` are **actual recorded runs**, not hand-written. A demo propped up by invented output nobody could reproduce is worse than no demo.

## Editing afterwards

<p align="center">
  <img src="docs/images/decisions-en.jpg" alt="The editor, with the decision log and theme picker" width="820">
</p>

Every judgement Jev made, with its confidence and when it landed. An edit that misfires is traceable rather than mysterious.


Say what you want in plain language. One request, 200–400 ms, and **no copy is regenerated**:

| You say | Result |
|---|---|
| drop the pricing | `remove` → pricing `1.00` |
| make the palette more playful | `theme` → coral `1.00` |
| center the nav bar | `restyle` → nav_centered `1.00` |
| change the nav style | `restyle` → any other one (`0.34`, all three are fine) |
| make features a list | `restyle` → features_list `1.00` |
| deploy this for me | `unclear` `1.00` |

That last row matters most: **when it cannot do something it says so**, instead of forcing the request into the nearest available edit.

This uses [speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md) — which block to remove, which to add, which theme, which block to restyle, all asked in one request, with code reading only the branch that won. More tokens, one fewer round trip.

### The same 0.34, sometimes blocked and sometimes not

```
change the nav style     → restyle@1.00  variant=nav_centered@0.34   executed (any)
change the navbar style  → theme@0.87    theme_target=coral@0.15     blocked
```

"Change it" names no destination, so with the current variant excluded all three remaining options are acceptable and an even split is the **correct answer**. But when "change the navbar style" was misread as a whole-site recolour, that 0.15 meant it had no idea what to change to — and that one has to be blocked.

**A threshold is not a global constant. It follows from the cost of being wrong.**

## Language is a judgement, not a detection

The language the site is written in also goes to Jev, in the same request as theme and archetype, so it costs no extra round trip.

```
我在杭州开了家咖啡店                           → zh @1.00
我们做数据合规 SaaS，卖给海外客户，要做英文站     → en @1.00   ← described in Chinese, wants English
A small bakery in Brooklyn                   → en @0.66
東京で小さなラーメン屋をやっています              → ja @0.99
```

The second line is the point. **What you write in is not what you want written** — someone describes their business in Chinese but needs an English site for overseas customers, and they usually say so in that very sentence. Pure detection gets this wrong every time; judgement gets it right.

The `0.66` on the Brooklyn line is also correct: an English sentence that never states a target language makes `en` an inference rather than an instruction, so the probability should spread.

Supports `zh` / `en` / `ja` / `ko` / `zh-Hant`. Length hints are written for Chinese, so other languages get a conversion note appended.

The editor UI is a separate matter: Chinese, English, Japanese and Korean, picked from `navigator.languages` and switchable by hand. Translations live in `locales/*.json`; adding a language means adding a file and one line. **`zh.json` is the reference and tests assert the other files carry exactly its keys** — a half-finished translation fails CI instead of silently falling back to Chinese at runtime.

## Export

Three formats, all derived from **the same rendered result**. There is no second copy of the layout code.

| Export | Size | For |
|---|---|---|
| `site.html` | 36 KB | Put it online, or just double-click it |
| `Site.tsx` | 34 KB | Keep developing; compiles under `tsc --strict` |
| `spec.json` | a few KB | Archive it, or feed another renderer |

### Site.tsx

One flat component, no dependency beyond React. Colours, fonts and radii all live in a single style object on the outermost element, so retheming means editing one place. Tailwind class names are preserved.

Component splitting is deliberately skipped — a generated file you can read top to bottom and cut apart yourself beats a structure you have to reverse-engineer first.

Verification is a real `tsc --noEmit --strict --jsx react-jsx` run, **judged by exit code**. That is how the first version turned out not to compile: CSS custom properties are not valid in `React.CSSProperties`. It now emits an `as CSSProperties` cast.

### site.html

The rendered result plus **only the CSS rules it actually uses**.

```
all CSS on the page   22 KB      ← Tailwind already tree-shakes in a production build
actual export         29 KB      ← including the HTML
editor's own styles   removed    ← no input box, buttons or decision log
```

Filtering tests each selector with `root.matches()` / `root.querySelector()`, strips pseudo-classes and retries on the base selector, recurses into `@media` and drops the whole block when nothing inside survives, and keeps `:root` and `@font-face` unconditionally. **A selector it cannot parse is kept rather than dropped** — a slightly larger file beats a silently broken one.

Size-wise it only saves 16% (Tailwind was never the problem). The real gain is that the exported site no longer carries the editor's own styling. See `lib/export.ts`; there is **no second renderer**, block layout exists only in `app/registry.tsx`.

## Themes are data

<p align="center">
  <img src="docs/images/themes-en.jpg" alt="The same generated site under all six themes" width="820">
</p>

The same generated copy under all six themes. Switching is a single client-side prop change — no model call, no regeneration.


Six themes, each a complete set of design tokens. `app/registry.tsx` contains **no hex values at all** — everything reads from CSS variables:

| Theme | Character | Suits |
|---|---|---|
| `forest` | Deep green + off-white | Tools, open source, outdoors |
| `corporate` | Navy + 6px radius | Finance, legal, enterprise |
| `warm` | Caramel + serif + 16px radius | Food, craft, guesthouses |
| `ink` | Pure black and white, zero radius, generous space | Photography, portfolios, publishing |
| `terminal` | Dark ground + monospace + teal | Developer tools, infrastructure |
| `coral` | Bright orange + 20px radius | Consumer, education, social |

Switching theme is therefore a single client-side prop change: no model call, no copy touched, instant. Content, structure and appearance are fully decoupled.

## 13 blocks, 6 page archetypes

Blocks: nav (4 variants), hero (2), social proof (3), features (2), gallery, comparison, steps, team, pricing (2), contact, FAQ, CTA band, footer.

The archetype decides which blocks are **required** — no model gets to drop a landing page's hero, or a local business's address:

| Archetype | Required | Optional |
|---|---|---|
| Landing page | nav hero features cta footer | social pricing faq gallery steps |
| Local business | nav hero **contact** footer | gallery steps social faq pricing |
| Technical detail | nav hero features footer | faq social steps |
| Pricing page | nav pricing faq cta footer | social hero |
| Open-source home | nav hero features footer | faq social pricing |
| Minimal one-pager | hero | nav footer |

## Tests

```bash
npm test          # 39 of them, 2.5s, no network
```

They cover **the three rules taken back from the model** — selling-point count decides grid vs list, tier count decides single vs comparison, whether there is a UI screenshot decides the hero layout. If any of these drift, the decision quietly goes back to a model that cannot make it, so they are the ones that must not move.

Also covered: readiness gating (an empty array counts as missing, not ready), `asSettled` completion ordering, and the JSX serializer's sharp edges — custom properties need `as CSSProperties`, semicolons inside a gradient are not separators, text containing braces must be wrapped, and the `blk-in` animation class and `<style>` block must not reach the export.

Plus structural invariants: every slot an archetype references must exist, required and optional must not overlap, `SLOT_ORDER` must cover every slot exactly once, and every variant must declare the fields it needs.

Locale files get their own set: keys must match `zh.json` exactly, no blank values, the same number of examples, and each language's examples must actually be written in that script (checked with Han / kana / Hangul regexes).

**Every test was mutation-verified afterwards**, because a suite that passes the moment you write it proves nothing:

```
grid threshold 5 → 4        → red ✓    ja.json missing a key      → red ✓
invert the hero condition   → red ✓    ja.json blank value        → red ✓
let an empty array be ready → red ✓    ja.json two fewer examples → red ✓
drop the CSSProperties cast → red ✓    ko.json English example    → red ✓
stop stripping style blocks → red ✓
```

## Layout

```
lib/
  catalog.ts           component contract: which blocks may appear, and their props
  themes.ts            6 token sets, plus the rubric Jev chooses from
  plan.ts              archetypes, slot variants, code rules in layoutRules()
  content.ts           the shape of the copy, and how it fills each block
  content-parallel.ts  four parallel chunks, retry, shape validation, readiness
  compose.ts           three-layer orchestration, streamed
  edit.ts              edit intent recognition (speculative fan-out)
  export.ts            self-contained HTML, only the CSS in use
  export-tsx.ts        React source export, DOM → JSX
  i18n.ts              UI language, reads locales/*.json
  *.test.ts            pure-logic tests, no network
locales/
  zh|en|ja|ko.json     UI translations, zh is the reference
app/
  page.tsx             the editor, stream consumption, client-side retheme/restyle
  registry.tsx         what blocks look like, all via CSS variables
  api/generate         generation
  api/edit             edits
```

## Known limits

- **The LLM emits invalid JSON.** Measured: roughly one run in two. Retry and shape validation catch it, but this is inherent to generative models — the Jev side never produced a single malformed response.
- **13 seconds is not fast**, and all of it is the LLM writing copy. Skeletons make the first paint visible at 0.7s, but the total is unchanged.
- **13 block types**, still missing a contact form, video and maps. `Gallery` renders tinted placeholder tiles with captions; it does not generate images.
- **`Site.tsx` is one flat stretch of JSX**, not a split component tree. It compiles and it is editable, but long-term maintenance means splitting it yourself.
- **Copy quality follows the model.** A stronger one is noticeably better, and noticeably slower.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Adding a block, a theme or a UI language each has a short, established path.

## Star History

If the approach is useful to you, a star is the most direct feedback.

<a href="https://star-history.com/#yldm-tech/loom&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=yldm-tech/loom&type=Date&theme=dark" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=yldm-tech/loom&type=Date" width="600" />
  </picture>
</a>

## License

Apache-2.0. Built on the published npm packages of [json-render](https://github.com/vercel-labs/json-render) (Vercel Labs, Apache-2.0); no upstream source is vendored. Judgements come from [TypeSafe](https://typesafe.ai)'s Jev model. See `NOTICE`.
