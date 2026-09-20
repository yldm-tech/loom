/**
 * shadcn registry item export.
 *
 * The other three exports hand over an artefact and leave the recipient to work out the rest: site.html is a page you cannot edit, Site.tsx is a file that references seventeen CSS custom properties nothing in the target project defines, spec.json is data. This one hands over a verb. `npx shadcn@latest add ./site.registry.json` writes the component into whatever directory the project's components.json calls components, merges the theme tokens into its stylesheet, and installs dependencies — and it is a command the agents people point at this thing already know. The CLI documents the `add` argument as "name, url or local path to component", so a file on disk works with nothing hosted behind it.
 *
 * The component text comes from buildReactSource. There is no second renderer here and there must not be one: every exporter reads back the DOM the app already rendered, which is the only reason the thirteen block layouts exist in exactly one place.
 *
 * The one genuinely dangerous detail is the cssVars key spelling, and it is dangerous precisely because getting it wrong is silent — see the comment on themeCssVars below.
 */

import { buildReactSource } from "./export-tsx";
import { THEMES, themeVars } from "./themes";

/** Emitted when the request yields no ASCII the CLI can use as a name. Registry names travel through URLs and filenames, so an empty or CJK one is not an option. */
const FALLBACK_NAME = "loom-site";

/** A name is a URL segment and a CLI argument before it is a label; a whole sentence makes both unusable. */
const NAME_LIMIT = 40;

/** The schema asks for a title that is "short and descriptive"; the untruncated request lives in `description`. */
const TITLE_LIMIT = 60;

/** themes.ts resolves an unknown key to this one. Duplicated rather than exported because themeVars() gives back tokens, not the name it settled on — and a description that names a theme the tokens did not come from is worse than no description. A test pins the two together. */
const FALLBACK_THEME = "forest";

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function slugify(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NAME_LIMIT)
    .replace(/-+$/, "");
  return slug || FALLBACK_NAME;
}

/**
 * loom's theme tokens, keyed the way the shadcn CLI expects: WITHOUT the leading `--` that themeVars() returns.
 *
 * Verified against shadcn 4.21.0 and the published docs rather than recalled, because the failure mode is an install that reports success and themes nothing.
 *
 * The docs example at /docs/registry/registry-item-json writes `"light": { "brand": "oklch(0.205 0.015 18)" }` and the `tailwind` example immediately above it refers to the same token as `hsl(var(--brand))` — the CLI is what puts the dashes on. In the CLI's postcss pass the declaration itself is forgiving: `update-css-vars-v4` emits `--${key.replace(/^--/, "")}`, which normalises either spelling. The `update-theme` plugin that runs straight after it is not. It builds the Tailwind v4 `@theme inline` bridge with the property stripped but the value not: property `--color-${key.replace(/^--/, "")}`, value `var(--${key})`. A key of `"--accent"` therefore emits `--color-accent: var(----accent)` — four dashes, resolves to nothing, no error anywhere. That same plugin also expands the radius scale (`--radius-sm` through `--radius-4xl`) by matching the literal key `radius`, so `"--radius"` would skip the expansion without saying so.
 *
 * `light` is the bucket because it is the one the CLI maps to `:root` (`const selector = bucket === "light" ? ":root" : `.${bucket}``). There is no `dark` counterpart: a loom theme is a single closed palette, and some of them — terminal — are dark palettes. Writing those into `.dark` would leave `:root` empty and the page unthemed in the default colour scheme.
 */
function themeCssVars(theme: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(themeVars(theme)).map(([token, value]) => [token.replace(/^--/, ""), value]),
  );
}

/**
 * The generated site as a shadcn registry item, pretty-printed.
 *
 * Note what is deliberately absent: a top-level `theme` key. The schema's `allOf` turns `theme`, `style`, `iconLibrary` and `baseColor` into `false` for every type except `registry:base`, so putting the theme name there would make the file fail validation outright. It goes in the description instead.
 */
export function buildRegistryItem(root: Element, prompt: string, theme: string): string {
  const request = oneLine(prompt);
  const themeName = THEMES[theme] ? theme : FALLBACK_THEME;

  const item = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: slugify(request),
    // `registry:block` is what shadcn's own multi-part items use at the top level, with the files inside typed by what each one is. A single flat component is still a block: `registry:component` and `registry:block` both resolve a file to the project's components directory, and `block` is the honest label for a whole page section.
    type: "registry:block",
    title: request.slice(0, TITLE_LIMIT).trim() || FALLBACK_NAME,
    description: request
      ? `Landing page generated by loom from the request: ${request}. Carries loom's "${themeName}" theme tokens, merged into the project stylesheet on install.`
      : `Landing page generated by loom. Carries loom's "${themeName}" theme tokens, merged into the project stylesheet on install.`,
    // Empty on purpose, and stated rather than omitted. Site.tsx imports one type from react, which every project the CLI can target already has — shadcn's own items never list react either. Padding this with tailwindcss or clsx would make the CLI install packages the file does not import.
    dependencies: [] as string[],
    files: [
      {
        // The CLI strips the leading segment that matches the resolved components directory, so this lands at `<components>/site.tsx` rather than nesting a second `components/`.
        path: "components/site.tsx",
        type: "registry:component",
        content: buildReactSource(root, prompt),
      },
    ],
    cssVars: { light: themeCssVars(themeName) },
  };

  return JSON.stringify(item, null, 2);
}
