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
  comparisonTitle: string;
  comparisonUs: string;
  comparisonThem: string;
  comparison: { label: string; us: string; them: string }[];
  teamTitle: string;
  testimonialsTitle: string;
  faqTitle: string;
  pricingCta: string;
  contactLabels: { address: string; hours: string; phone: string };
  team: { name: string; role: string; bio: string }[];
};

/** Fill every block template with the generated content. */
export function elementsFor(content: SiteContent) {
  // Asked to price a free project, the model answers `"tiers": "免费"` — a string where the schema asked for an array, and valid JSON, so neither retry attempt fires. `(content.tiers ?? []).slice(0, 1).map(...)` was the only eager array operation in this function, so that string threw `.map is not a function` inside the generator and destroyed a page that had no pricing block in it at all.
  //
  // So the guard exists to keep that operation from throwing — and only that. What goes into the props is whatever the model actually sent, because coercing it to `[]` here laundered a contract violation into something that satisfies the catalog: an empty array is a legal `tiers`, so validateProps passed it and the page drew a pricing block with a heading, a button and no prices. Guard the operation, not the payload; a value that cannot be a tier list is then visible to the check that knows what one is, and the block holds its place as a skeleton instead.
  const tierList = Array.isArray(content.tiers) ? content.tiers : [];
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
        cta: content.pricingCta,
        title: content.pricingTitle,
        tiers: Array.isArray(content.tiers)
          ? tierList.slice(0, 1).map((t) => ({ ...t, highlighted: true }))
          : content.tiers,
      },
    },
    pricing_multi: {
      type: "Pricing",
      props: { title: content.pricingTitle, tiers: content.tiers, cta: content.pricingCta },
    },
    testimonials: {
      type: "Testimonials",
      props: { title: content.testimonialsTitle, items: content.testimonials },
    },
    faq: { type: "FAQ", props: { title: content.faqTitle, items: content.faq } },
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
        labels: content.contactLabels,
        note: content.contactNote,
      },
    },
    comparison: {
      type: "Comparison",
      props: {
        title: content.comparisonTitle,
        us: content.comparisonUs,
        them: content.comparisonThem,
        rows: content.comparison,
      },
    },
    team: {
      type: "Team",
      props: { title: content.teamTitle, members: content.team },
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
