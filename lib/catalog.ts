import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * The component contract: every block the generator is allowed to produce, and
 * the exact props each one takes. Nothing outside this catalog can ever appear
 * in a generated page — that guarantee is the point of the whole design.
 *
 * The guarantee held for the component *names* and not for the props under them. `catalog.validate()` checks the spec's shape — that every element names a component this catalog declares — and stops there: a `Pricing` element whose `tiers` is the string `"免费"` returns `success: true` from it. The schemas below were therefore a description of what the LLM ought to send rather than a check on what it did send, and the only thing standing between a wrong-typed field and the renderer was `isReady`, which tests whether a value is present and non-blank, not whether it is the right kind of thing.
 *
 * `validateProps` closes that. It reads the very schemas declared here, so the contract is enforced by the file that states it and there is no second description of any block's shape to drift out of step.
 */
export const catalog = defineCatalog(schema, {
  components: {
    Page: { props: z.object({ theme: z.string() }), slots: ["default"] },
    Nav: {
      props: z.object({
        brand: z.string(),
        links: z.array(z.string()),
        cta: z.string(),
        variant: z.string(),
        notice: z.string().nullable(),
      }),
    },
    HeroCentered: {
      props: z.object({
        eyebrow: z.string(),
        title: z.string(),
        subtitle: z.string(),
        primaryCta: z.string(),
        secondaryCta: z.string(),
      }),
    },
    HeroSplit: {
      props: z.object({
        title: z.string(),
        subtitle: z.string(),
        primaryCta: z.string(),
        bullets: z.array(z.string()),
      }),
    },
    LogoRow: { props: z.object({ caption: z.string(), logos: z.array(z.string()) }) },
    FeatureGrid: {
      props: z.object({
        title: z.string(),
        items: z.array(z.object({ icon: z.string(), title: z.string(), body: z.string() })),
      }),
    },
    FeatureList: {
      props: z.object({
        title: z.string(),
        items: z.array(z.object({ title: z.string(), body: z.string() })),
      }),
    },
    StatBand: {
      props: z.object({ items: z.array(z.object({ value: z.string(), label: z.string() })) }),
    },
    Pricing: {
      props: z.object({
        title: z.string(),
        cta: z.string(),
        tiers: z.array(
          z.object({
            name: z.string(),
            price: z.string(),
            period: z.string(),
            features: z.array(z.string()),
            highlighted: z.boolean(),
          }),
        ),
      }),
    },
    Testimonials: {
      props: z.object({
        title: z.string(),
        items: z.array(z.object({ quote: z.string(), name: z.string(), role: z.string() })),
      }),
    },
    FAQ: {
      props: z.object({
        title: z.string(),
        items: z.array(z.object({ q: z.string(), a: z.string() })),
      }),
    },
    CTABand: { props: z.object({ title: z.string(), body: z.string(), cta: z.string() }) },
    Footer: { props: z.object({ brand: z.string(), columns: z.array(z.string()), note: z.string() }) },
    Gallery: {
      props: z.object({
        title: z.string(),
        caption: z.string(),
        items: z.array(z.object({ title: z.string(), note: z.string() })),
      }),
    },
    Steps: {
      props: z.object({
        title: z.string(),
        items: z.array(z.object({ title: z.string(), body: z.string() })),
      }),
    },
    Contact: {
      props: z.object({
        title: z.string(),
        address: z.string(),
        hours: z.string(),
        phone: z.string(),
        note: z.string(),
        labels: z.object({
          address: z.string(),
          hours: z.string(),
          phone: z.string(),
        }),
      }),
    },
    Comparison: {
      props: z.object({
        title: z.string(),
        us: z.string(),
        them: z.string(),
        rows: z.array(z.object({ label: z.string(), us: z.string(), them: z.string() })),
      }),
    },
    Team: {
      props: z.object({
        title: z.string(),
        members: z.array(z.object({ name: z.string(), role: z.string(), bio: z.string() })),
      }),
    },
    Skeleton: { props: z.object({ kind: z.string() }) },
  },
  actions: {},
});

/** Why a block cannot be rendered as asked, phrased for a decision log rather than for a developer. */
export type PropsProblem = { component: string; path: string; expected: string };

/**
 * Whether a set of props satisfies the schema its component declares above.
 *
 * The component name arrives from a table this repo owns, but the props arrive from a model, so the lookup is by `Object.hasOwn` rather than by indexing: `constructor` is not a component and must not resolve to one.
 *
 * A failure returns the first offending path rather than the whole issue list. The caller's move is the same whatever the count — hold the block back — and one path is what fits in a log line a person will actually read.
 */
export function validateProps(type: string, props: unknown): PropsProblem | null {
  const components = catalog.data.components as Record<string, { props?: z.ZodType }>;
  if (!Object.hasOwn(components, type)) return { component: type, path: "", expected: "a component this catalog declares" };

  const shape = components[type]!.props;
  if (!shape) return null;

  const result = shape.safeParse(props);
  if (result.success) return null;

  const issue = result.error.issues[0]!;
  return {
    component: type,
    path: issue.path.join("."),
    // zod's own wording, because it names the type it wanted and the type it got, which is the whole content of the answer.
    expected: issue.message,
  };
}
