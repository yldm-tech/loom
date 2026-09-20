import type { SlotKey } from "./plan";

/**
 * Where to find components worth stealing.
 *
 * The workflow this exists for is the lazy one: point a coding agent at a good
 * library, let it pick, adapt and paste. That only works if the agent is told
 * the truth about each library, and the truth here is uncomfortable — none of
 * these five ships a marketing page section. There is no hero, no testimonial
 * block, no team grid and no footer anywhere in the set. They are primitives,
 * motion, and app-shaped widgets.
 *
 * So `role` is the most important field in this table, not `blocks`. A source
 * improves a block loom already renders; it never replaces one. An agent that
 * reads this as a block catalogue will go looking for a hero in shadcn/ui,
 * find /blocks/login instead, and either give up or invent something.
 *
 * Every url, endpoint and install command below was fetched and checked rather
 * than recalled. They will still rot — `npm run sources` re-checks them.
 */

/** What a source actually gives you, which decides how an agent should use it. */
export type SourceRole =
  /** Unstyled, accessible building blocks: menus, dialogs, tables, form controls. */
  | "primitives"
  /** Animation only. Applies to a block loom already renders; contains no layout. */
  | "motion"
  /** Finished single-purpose widgets — a nav, a counter, an orb — not page sections. */
  | "widgets";

export type ComponentSource = {
  name: string;
  url: string;
  role: SourceRole;
  /** One factual line: what it is, not what it advertises. */
  summary: string;
  license: string;
  /** The exact command an agent should run, or null when the browser is the only way in. */
  install: string | null;
  /** Machine-readable surfaces that answered, for an agent that wants to enumerate before it picks. */
  endpoints: string[];
  /** loom slots this source can plausibly improve. Improve, not replace — see `role`. */
  blocks: SlotKey[];
  /** The thing that bites whoever pastes this in without reading first. */
  caveat: string;
};

export const COMPONENT_SOURCES: Record<string, ComponentSource> = {
  shadcn: {
    name: "shadcn/ui",
    url: "https://ui.shadcn.com",
    role: "primitives",
    summary:
      "63 accessible React primitives over Radix, plus the registry JSON spec and CLI that the other registries here target. The reference implementation, and the reason `npx shadcn add <url>` works at all.",
    license: "MIT",
    install: "npx shadcn@latest add <name>",
    endpoints: ["https://ui.shadcn.com/llms.txt", "https://ui.shadcn.com/r/index.json"],
    blocks: ["nav", "features", "comparison", "pricing", "contact", "faq", "footer"],
    caveat:
      "The first-party block catalogue is app-shaped — login, sidebar, signup, dashboard. There is no landing page in it. Primitives are also `registry:ui` only: /r/index.json does not list blocks, and /registry.json is a 404.",
  },
  beui: {
    name: "beUI",
    url: "https://beui.dev",
    role: "motion",
    summary:
      "85 animated React components — transitions, reveals, animated numbers, form controls with motion states — served as a shadcn-compatible registry with the most complete agent surface of the five.",
    license: "MIT for the public registry; pro.beui.dev is a separate paid tier",
    install: "npx shadcn@latest add https://beui.dev/r/<name>.json",
    endpoints: ["https://beui.dev/llms.txt", "https://beui.dev/r", "https://mcp.beui.dev/mcp"],
    blocks: ["nav", "hero", "social", "features", "gallery", "steps", "faq", "cta"],
    caveat:
      "Every component pulls `motion` plus clsx and tailwind-merge, and the source imports `@/lib/utils` for a `cn()` helper and shadcn token classes such as `text-foreground`. loom ships none of that. Also: /r/index.json is a 404 — the index is /r.",
  },
  rareui: {
    name: "Rare UI",
    url: "https://rareui.com",
    role: "widgets",
    summary:
      "About 20 single-file animated widgets — gooey nav, proximity sidebar, odometer counter, stepped player — published as an open shadcn registry.",
    license: "MIT",
    install: "npx shadcn@latest add swamimalode07/rare-ui/<name>",
    endpoints: ["https://www.rareui.com/llms.txt", "https://www.rareui.com/r/registry.json"],
    blocks: ["nav", "hero", "social", "gallery", "steps"],
    caveat:
      "Hostile to themed colour: no registry item declares `cssVars`, and the sources hardcode hex literals. Anything pasted in has to be rewritten onto loom's CSS custom properties or it will ignore the theme entirely.",
  },
  transitions: {
    name: "Transitions",
    url: "https://transitions.dev",
    role: "motion",
    summary:
      "About 44 named motion snippets as plain CSS with namespaced `.t-*` classes and a shared token block. Not components — the animation for a block you already have.",
    license: "Custom, not OSI. Redistribution of a substantial part of the collection is forbidden",
    install: "npx transitions-dev add <slug>",
    endpoints: ["https://transitions.dev/cli/free-manifest.json"],
    blocks: ["hero", "features", "gallery", "steps", "faq", "cta"],
    caveat:
      "The licence is the constraint, not the code: these snippets may be used in a site but must not be vendored into anything loom redistributes. The free CLI payload is also CSS and vanilla JS only — React variants are a paid tier.",
  },
  beautifului: {
    name: "Beautiful UI",
    url: "https://beautifului.dev",
    role: "primitives",
    summary:
      "21 primitives for AI application interfaces — chat composer, thinking state, approval card, tool chips, dense data tables. Careful work, and the furthest of the five from a marketing page.",
    license: "MIT",
    install: null,
    endpoints: [],
    blocks: ["features", "comparison", "steps"],
    caveat:
      "Copy-paste from the browser is the only way in: no CLI, no registry, no repo, no llms.txt. What you copy also does not compile alone — the sources import project-local paths such as `@/components/atoms/Button` that the site never publishes.",
  },
};

export type SourceKey = keyof typeof COMPONENT_SOURCES;

/**
 * The sources worth pointing an agent at for one slot, best-documented first.
 *
 * Ordering is by how much of the work is already machine-readable: a source an
 * agent can enumerate and install unattended beats a prettier one it has to be
 * driven through a browser to reach.
 */
export function sourcesFor(slot: SlotKey): ComponentSource[] {
  return Object.values(COMPONENT_SOURCES)
    .filter((source) => source.blocks.includes(slot))
    .sort((a, b) => b.endpoints.length - a.endpoints.length);
}
