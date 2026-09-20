**English** · [简体中文](docs/CONTRIBUTING.zh.md)

# Contributing to loom

Get it running first, so you know the environment is sound:

```bash
npm install
npm test        # 125 of them, ~4s, no network
npm run dev     # demo mode; no keys needed
```

The tests need no keys at all. If you are only touching pure logic you never have to create `.env.local`.

## Before opening a PR

```bash
npx tsc --noEmit && npm test && npm run build
```

That is exactly what CI runs.

## Adding a block

Four places. Miss one and TypeScript stops you — every component declared in `catalog.ts` must exist in `registry.tsx`.

1. `lib/catalog.ts` — declare the component and its props (zod)
2. `lib/content.ts` — add the fields to `SiteContent`, and fill them in `elementsFor()`
3. `lib/content-parallel.ts` — ask one of the chunks for those fields, and declare readiness in `SLOT_NEEDS`
4. `app/registry.tsx` — write the component. Colours and radii go through **CSS variables only**; no hex values

Then add the slot to `SLOTS` in `lib/plan.ts`, place it in `SLOT_ORDER`, and hang it off the right archetypes' `required` or `optional`. Point `SKELETON_KIND` in `lib/compose.ts` at a skeleton shape, and give it a label in `SLOT_LABELS` in `lib/edit.ts`.

## Adding a theme

`lib/themes.ts` only. A theme is a complete token set: palette, typeface, radius, gradients.

Contrast is not negotiable: `npm test` recomputes WCAG ratios from your token values and fails below 4.5:1 for anything carrying real text. `npm run audit:a11y` then checks what a browser actually renders. A theme that ships unreadable buttons is a defect in the generator, not a matter of taste.

The `description` field is **the rubric Jev chooses from**. Write what kind of business and mood it suits, not that the colour is nice. Measured: whether a description carries a decidable rule is the difference between 0.98 and 0.63 confidence.

## Adding a UI language

1. Copy `locales/zh.json` and translate every entry
2. Add a line each to `UI_LOCALES`, `LOCALE_LABELS` and `DICTS` in `lib/i18n.ts`
3. Add a prefix match in `detectLocale()`

`zh.json` is the reference for UI translations — note that the README's reference language is English; the two are independent. Tests assert the keys match exactly, no value is blank, the example counts line up, and each language's examples really are written in that script. A half-finished translation fails CI instead of silently falling back at runtime.

## Adding a site copy language

`LANGUAGES` in `lib/plan.ts` (the rubric Jev judges from) and `LANGUAGE_RULE` / `LENGTH_RULE` in `lib/content-parallel.ts` (the instructions the LLM writes under). Length hints are written for Chinese, so a new language needs a conversion note.

## On what to ask a model

This is the one place the project has an opinion. Please follow it when changing things:

| Kind of question | Goes to |
|---|---|
| The answer is in what the user said | **Jev**, as one mutually exclusive Choice |
| It does not exist in the system and can only be generated | **The LLM** |
| It follows from data you already have | **Code**, as a rule |

**Persistently low confidence is not the model's failing. It means you asked the wrong party.** This happened three times in this codebase; all three are written up in the README.

If some judgement sits below 0.3 for long, reach first for "can this become a factual question plus a code rule", not for prompt wording.

## On tests

New pure logic should come with tests, and **mutation-verify them afterwards** — break the thing under test by hand and confirm the test goes red. A suite that passes the moment you write it proves nothing.

Do not write tests that need the network. All of them together run in about three seconds, and that is worth keeping.

## Fixtures

`fixtures/*.jsonl` are **real recorded runs**, never hand-written. A demo propped up by invented output nobody could reproduce is worse than no demo. To refresh one, run the app with real keys and capture the stream from `/api/generate`.

## Docs

There are eight READMEs: `README.md` (English, the reference) and `docs/README.{zh,ja,ko,es,fr,de,pt}.md`.

Substantive changes should land in all of them. If you only read one or two of those languages, change the ones you can and say so in the PR; the rest can follow. **A translation lagging behind is better than a machine-translated one.**

Every one has screenshots in its own language. A test enforces that a translation uses its own set when one exists and the English set otherwise, never a mix — so a new language may ship with the English captures and gain its own later. To record a set, run with live keys to capture a fixture, then screenshot in demo mode with the UI in that locale.

Tests also check that all eight share the same heading outline level for level and quote the same measured figures. Decimal separators differ by language and are normalised before comparison, so `0,16` and `0.16` count as the same number.

## Conduct

Argue about the work, not the person. Settle technical disagreements with data — every claim in this project has a reproducible measurement behind it, and yours should too.
