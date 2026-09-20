import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * The component contract: every block the generator is allowed to produce, and
 * the exact props each one takes. Nothing outside this catalog can ever appear
 * in a generated page — that guarantee is the point of the whole design.
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
    Skeleton: { props: z.object({ kind: z.string() }) },
  },
  actions: {},
});
