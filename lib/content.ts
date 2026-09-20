/**
 * The shape of everything an LLM has to write before a page can exist.
 *
 * Jev cannot invent a single word, so the copy layer fills this in first. The
 * LLM never sees the component catalog and never emits layout — it only answers
 * questions about the business and writes prose.
 */
export type SiteContent = {
  brand: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBullets: string[];
  primaryCta: string;
  secondaryCta: string;
  navLinks: string[];
  features: { icon: string; title: string; body: string }[];
  featuresDeep: { title: string; body: string }[];
  featuresTitle: string;
  stats: { value: string; label: string }[];
  logos: string[];
  logosCaption: string;
  pricingTitle: string;
  tiers: {
    name: string;
    price: string;
    period: string;
    features: string[];
    highlighted: boolean;
  }[];
  freeTier: {
    name: string;
    price: string;
    period: string;
    features: string[];
  };
  testimonials: { quote: string; name: string; role: string }[];
  faq: { q: string; a: string }[];
  ctaTitle: string;
  ctaBody: string;
  footerColumns: string[];
  footerNote: string;
  visualKind?: "interface" | "product" | "scene" | "none";
  galleryTitle: string;
  galleryCaption: string;
  gallery: { title: string; note: string }[];
  stepsTitle: string;
  steps: { title: string; body: string }[];
  contactTitle: string;
  address: string;
  hours: string;
  phone: string;
  contactNote: string;
};

/** Fill every block template with the generated content. */
export function elementsFor(content: SiteContent) {
  return {
    page: { type: "Page", props: { theme: "auto" } },
    nav_standard: {
      type: "Nav",
      props: {
        brand: content.brand,
        links: content.navLinks,
        cta: content.primaryCta,
        variant: "standard",
        notice: null,
      },
    },
    nav_centered: {
      type: "Nav",
      props: {
        brand: content.brand,
        links: content.navLinks,
        cta: content.primaryCta,
        variant: "centered",
        notice: null,
      },
    },
    nav_minimal: {
      type: "Nav",
      props: {
        brand: content.brand,
        links: [],
        cta: content.primaryCta,
        variant: "minimal",
        notice: null,
      },
    },
    nav_notice: {
      type: "Nav",
      props: {
        brand: content.brand,
        links: content.navLinks,
        cta: content.primaryCta,
        variant: "standard",
        notice: content.tagline,
      },
    },
    hero_centered: {
      type: "HeroCentered",
      props: {
        eyebrow: content.tagline,
        title: content.heroTitle,
        subtitle: content.heroSubtitle,
        primaryCta: content.primaryCta,
        secondaryCta: content.secondaryCta,
      },
    },
    hero_split: {
      type: "HeroSplit",
      props: {
        title: content.heroTitle,
        subtitle: content.heroSubtitle,
        primaryCta: content.primaryCta,
        bullets: content.heroBullets,
      },
    },
    logos: {
      type: "LogoRow",
      props: { caption: content.logosCaption, logos: content.logos },
    },
    stats: { type: "StatBand", props: { items: content.stats } },
    features_grid: {
      type: "FeatureGrid",
      props: { title: content.featuresTitle, items: content.features },
    },
    features_list: {
      type: "FeatureList",
      props: { title: content.featuresTitle, items: content.featuresDeep },
    },
    pricing_single: {
      type: "Pricing",
      props: {
        title: content.pricingTitle,
        tiers: (content.tiers ?? []).slice(0, 1).map((t) => ({ ...t, highlighted: true })),
      },
    },
    pricing_multi: {
      type: "Pricing",
      props: { title: content.pricingTitle, tiers: content.tiers },
    },
    testimonials: {
      type: "Testimonials",
      props: { title: "他们怎么说", items: content.testimonials },
    },
    faq: { type: "FAQ", props: { title: "常见问题", items: content.faq } },
    cta_band: {
      type: "CTABand",
      props: { title: content.ctaTitle, body: content.ctaBody, cta: content.primaryCta },
    },
    gallery: {
      type: "Gallery",
      props: {
        title: content.galleryTitle,
        caption: content.galleryCaption,
        items: content.gallery,
      },
    },
    steps: {
      type: "Steps",
      props: { title: content.stepsTitle, items: content.steps },
    },
    contact: {
      type: "Contact",
      props: {
        title: content.contactTitle,
        address: content.address,
        hours: content.hours,
        phone: content.phone,
        note: content.contactNote,
      },
    },
    footer: {
      type: "Footer",
      props: {
        brand: content.brand,
        columns: content.footerColumns,
        note: content.footerNote,
      },
    },
  } as Record<string, { type: string; props: Record<string, unknown> }>;
}
