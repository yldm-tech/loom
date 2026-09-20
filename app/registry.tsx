"use client";

import { defineRegistry } from "@json-render/react";
import { catalog } from "@/lib/catalog";
import { themeVars } from "@/lib/themes";

const SECTION = "px-8 py-16";
const INNER = "mx-auto max-w-5xl";

/**
 * Every colour, radius and typeface reads from CSS variables the Page sets, so
 * the same markup renders as six different design systems. Jev picks which one;
 * this file never knows a hex code.
 */
export const { registry } = defineRegistry(catalog, {
  components: {
    Page: ({ props, children }) => (
      <div
        style={themeVars(String(props.theme ?? "forest")) as React.CSSProperties}
        className="antialiased"
      >
        <style>{`
          @keyframes blk-in {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: none; }
          }
          .blk-in { animation: blk-in 420ms cubic-bezier(.22,.61,.36,1) both; }
          @media (prefers-reduced-motion: reduce) { .blk-in { animation: none; } }
        `}</style>
        <div
          style={{
            background: "var(--bg)",
            color: "var(--text)",
            fontFamily: "var(--font)",
            letterSpacing: "var(--tracking)",
          }}
        >
          {children}
        </div>
      </div>
    ),

    Nav: ({ props }) => {
      const variant = String(props.variant ?? "standard");
      const links = (props.links as string[]) ?? [];
      const notice = props.notice as string | null;

      const cta = (
        <button
          className="px-4 py-2 text-[14px] font-medium"
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
            borderRadius: "var(--radius)",
          }}
        >
          {props.cta}
        </button>
      );
      const brand = (
        <span className="text-[15px] font-semibold" style={{ fontFamily: "var(--display)" }}>
          {props.brand}
        </span>
      );
      const linkRow = (
        <div className="flex gap-7 text-[14px]" style={{ color: "var(--muted)" }}>
          {links.map((link) => (
            <span key={link} className="cursor-pointer">
              {link}
            </span>
          ))}
        </div>
      );

      const shell = (inner: React.ReactNode) => (
        <nav
          className="blk-in sticky top-0 z-10 backdrop-blur"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--bg) 85%, transparent)",
          }}
        >
          {notice && (
            <div
              className="px-8 py-1.5 text-center text-[12px]"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              {notice}
            </div>
          )}
          {inner}
        </nav>
      );

      if (variant === "centered") {
        return shell(
          <div className={`${INNER} flex flex-col items-center gap-3 px-8 py-4`}>
            <div className="flex w-full items-center justify-between">
              <span className="w-24" />
              {brand}
              <div className="flex w-24 justify-end">{cta}</div>
            </div>
            <div className="hidden sm:block">{linkRow}</div>
          </div>,
        );
      }

      if (variant === "minimal") {
        return shell(
          <div className={`${INNER} flex items-center justify-between px-8 py-4`}>
            {brand}
            {cta}
          </div>,
        );
      }

      return shell(
        <div className={`${INNER} flex items-center justify-between px-8 py-4`}>
          {brand}
          <div className="hidden sm:block">{linkRow}</div>
          {cta}
        </div>,
      );
    },

    HeroCentered: ({ props }) => (
      <header
        className={`${SECTION} blk-in py-24 text-center`}
        style={{ background: "linear-gradient(to bottom, var(--hero-from), var(--hero-to))" }}
      >
        <div className={INNER}>
          <span
            className="text-[13px] font-medium uppercase tracking-widest"
            style={{ color: "var(--accent)" }}
          >
            {props.eyebrow}
          </span>
          <h1
            className="pt-4 text-5xl font-bold sm:text-6xl"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h1>
          <p
            className="mx-auto max-w-2xl pt-5 text-[17px] leading-relaxed"
            style={{ color: "var(--muted)" }}
          >
            {props.subtitle}
          </p>
          <div className="flex justify-center gap-3 pt-8">
            <button
              className="px-6 py-3 text-[15px] font-medium"
              style={{
                background: "var(--accent)",
                color: "var(--accent-text)",
                borderRadius: "var(--radius)",
              }}
            >
              {props.primaryCta}
            </button>
            <button
              className="px-6 py-3 text-[15px] font-medium"
              style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)" }}
            >
              {props.secondaryCta}
            </button>
          </div>
        </div>
      </header>
    ),

    HeroSplit: ({ props }) => (
      <header
        className={`${SECTION} blk-in py-20`}
        style={{ background: "linear-gradient(135deg, var(--hero-from), var(--hero-to))" }}
      >
        <div className={`${INNER} grid items-center gap-12 md:grid-cols-2`}>
          <div>
            <h1
              className="text-4xl font-bold leading-tight sm:text-5xl"
              style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
            >
              {props.title}
            </h1>
            <p className="pt-4 text-[16px] leading-relaxed" style={{ color: "var(--muted)" }}>
              {props.subtitle}
            </p>
            <ul className="space-y-2 pt-6">
              {(props.bullets as string[]).map((bullet) => (
                <li key={bullet} className="flex gap-2 text-[15px]">
                  <span style={{ color: "var(--accent)" }}>✓</span>
                  {bullet}
                </li>
              ))}
            </ul>
            <button
              className="mt-8 px-6 py-3 text-[15px] font-medium"
              style={{
                background: "var(--accent)",
                color: "var(--accent-text)",
                borderRadius: "var(--radius)",
              }}
            >
              {props.primaryCta}
            </button>
          </div>
          <div
            className="flex aspect-[4/3] items-center justify-center p-6"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "calc(var(--radius) * 1.6)",
            }}
          >
            <div className="w-full">
              <div className="flex gap-1.5 pb-4">
                {["#ff5f57", "#febc2e", "#28c840"].map((dot) => (
                  <span
                    key={dot}
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: dot, opacity: 0.7 }}
                  />
                ))}
              </div>
              <div className="space-y-2">
                {[92, 74, 58, 81, 45].map((width, index) => (
                  <div
                    key={width}
                    className="h-2.5"
                    style={{
                      width: `${width}%`,
                      borderRadius: "999px",
                      background: index === 0 ? "var(--accent)" : "var(--border)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>
    ),

    LogoRow: ({ props }) => (
      <section
        className="blk-in px-8 py-8"
        style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        <div className={`${INNER} text-center`}>
          <p className="text-[13px]" style={{ color: "var(--muted)" }}>
            {props.caption}
          </p>
          <div className="flex flex-wrap justify-center gap-8 pt-4">
            {(props.logos as string[]).map((logo) => (
              <span key={logo} className="text-[15px] font-medium" style={{ color: "var(--muted)" }}>
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>
    ),

    StatBand: ({ props }) => (
      <section className="blk-in px-8 py-12" style={{ background: "var(--band)", color: "var(--band-text)" }}>
        <div className={`${INNER} grid grid-cols-2 gap-8 text-center sm:grid-cols-4`}>
          {(props.items as { value: string; label: string }[]).map((item) => (
            <div key={item.label}>
              <div className="text-3xl font-bold" style={{ fontFamily: "var(--display)" }}>
                {item.value}
              </div>
              <div className="pt-1 text-[13px]" style={{ color: "var(--band-muted)" }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </section>
    ),

    FeatureGrid: ({ props }) => (
      <section className={`${SECTION} blk-in`}>
        <div className={INNER}>
          <h2
            className="text-center text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <div className="grid gap-8 pt-12 sm:grid-cols-2 md:grid-cols-3">
            {(props.items as { icon: string; title: string; body: string }[]).map((item) => (
              <div key={item.title}>
                <div className="text-2xl" style={{ color: "var(--accent)" }}>
                  {item.icon}
                </div>
                <h3 className="pt-3 text-[16px] font-semibold">{item.title}</h3>
                <p className="pt-1 text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    ),

    FeatureList: ({ props }) => (
      <section className={`${SECTION} blk-in`}>
        <div className={`${INNER} max-w-3xl`}>
          <h2
            className="text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <div className="space-y-10 pt-10">
            {(props.items as { title: string; body: string }[]).map((item, index) => (
              <div key={item.title} className="flex gap-5">
                <span className="text-[13px]" style={{ color: "var(--accent)", fontFamily: "var(--font)" }}>
                  0{index + 1}
                </span>
                <div>
                  <h3 className="text-[18px] font-semibold">{item.title}</h3>
                  <p className="pt-2 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    ),

    Pricing: ({ props }) => {
      const tiers = props.tiers as {
        name: string;
        price: string;
        period: string;
        features: string[];
        highlighted: boolean;
      }[];
      return (
        <section className={`${SECTION} blk-in`} style={{ background: "var(--surface)" }}>
          <div className={INNER}>
            <h2
              className="text-center text-3xl font-bold"
              style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
            >
              {props.title}
            </h2>
            <div
              className={`mx-auto grid gap-6 pt-12 ${tiers.length === 1 ? "max-w-sm" : "md:grid-cols-3"}`}
            >
              {tiers.map((tier) => (
                <div
                  key={tier.name}
                  className="p-7"
                  style={{
                    background: "var(--bg)",
                    borderRadius: "calc(var(--radius) * 1.4)",
                    border: tier.highlighted
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border)",
                  }}
                >
                  <div className="text-[15px] font-semibold">{tier.name}</div>
                  <div className="flex items-baseline gap-1 pt-3">
                    <span className="text-4xl font-bold" style={{ fontFamily: "var(--display)" }}>
                      {tier.price}
                    </span>
                    <span className="text-[14px]" style={{ color: "var(--muted)" }}>
                      / {tier.period}
                    </span>
                  </div>
                  <ul className="space-y-2 pt-6">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-2 text-[14px]">
                        <span style={{ color: "var(--accent)" }}>✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="mt-7 w-full py-2.5 text-[14px] font-medium"
                    style={{
                      borderRadius: "var(--radius)",
                      background: tier.highlighted ? "var(--accent)" : "transparent",
                      color: tier.highlighted ? "var(--accent-text)" : "var(--text)",
                      border: tier.highlighted ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {String(props.cta)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    },

    Testimonials: ({ props }) => (
      <section className={`${SECTION} blk-in`}>
        <div className={INNER}>
          <h2
            className="text-center text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <div className="grid gap-6 pt-12 md:grid-cols-3">
            {(props.items as { quote: string; name: string; role: string }[]).map((item) => (
              <figure
                key={item.name}
                className="p-6"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "calc(var(--radius) * 1.4)",
                }}
              >
                <blockquote className="text-[15px] leading-relaxed">「{item.quote}」</blockquote>
                <figcaption className="pt-5 text-[13px]">
                  <span className="font-medium">{item.name}</span>
                  <span style={{ color: "var(--muted)" }}> · {item.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    ),

    FAQ: ({ props }) => (
      <section className={`${SECTION} blk-in`} style={{ background: "var(--surface)" }}>
        <div className={`${INNER} max-w-3xl`}>
          <h2
            className="text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <dl className="pt-8">
            {(props.items as { q: string; a: string }[]).map((item) => (
              <div key={item.q} className="py-5" style={{ borderTop: "1px solid var(--border)" }}>
                <dt className="text-[16px] font-medium">{item.q}</dt>
                <dd className="pt-2 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    ),

    CTABand: ({ props }) => (
      <section
        className="blk-in px-8 py-16 text-center"
        style={{ background: "var(--band)", color: "var(--band-text)" }}
      >
        <div className={INNER}>
          <h2
            className="text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <p className="pt-3 text-[16px]" style={{ color: "var(--band-muted)" }}>
            {props.body}
          </p>
          <button
            className="mt-8 px-7 py-3 text-[15px] font-medium"
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              borderRadius: "var(--radius)",
            }}
          >
            {props.cta}
          </button>
        </div>
      </section>
    ),

    Footer: ({ props }) => (
      <footer className="blk-in px-8 py-12" style={{ borderTop: "1px solid var(--border)" }}>
        <div className={`${INNER} flex flex-wrap items-start justify-between gap-8`}>
          <div>
            <div className="text-[15px] font-semibold" style={{ fontFamily: "var(--display)" }}>
              {props.brand}
            </div>
            <div className="pt-2 text-[13px]" style={{ color: "var(--muted)" }}>
              {props.note}
            </div>
          </div>
          <div className="flex gap-10 text-[14px]" style={{ color: "var(--muted)" }}>
            {(props.columns as string[]).map((column) => (
              <span key={column}>{column}</span>
            ))}
          </div>
        </div>
      </footer>
    ),


    Gallery: ({ props }) => (
      <section className={`${SECTION} blk-in`}>
        <div className={INNER}>
          <h2
            className="text-center text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <p className="pt-3 text-center text-[15px]" style={{ color: "var(--muted)" }}>
            {props.caption}
          </p>
          <div className="grid gap-5 pt-10 sm:grid-cols-2 md:grid-cols-3">
            {(props.items as { title: string; note: string }[]).map((item, index) => (
              <figure key={item.title}>
                {/* No image generation here: the tile is an honest placeholder
                    carrying the caption the copy layer wrote. */}
                <div
                  className="flex aspect-[4/3] items-end p-4"
                  style={{
                    background: `color-mix(in srgb, var(--accent) ${6 + (index % 3) * 5}%, var(--surface))`,
                    border: "1px solid var(--border)",
                    borderRadius: "calc(var(--radius) * 1.4)",
                  }}
                >
                  <span className="text-[12px]" style={{ color: "var(--muted)" }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <figcaption className="pt-3">
                  <div className="text-[15px] font-medium">{item.title}</div>
                  <div className="pt-0.5 text-[13px]" style={{ color: "var(--muted)" }}>
                    {item.note}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    ),

    Steps: ({ props }) => {
      const items = props.items as { title: string; body: string }[];
      return (
        <section className={`${SECTION} blk-in`} style={{ background: "var(--surface)" }}>
          <div className={INNER}>
            <h2
              className="text-center text-3xl font-bold"
              style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
            >
              {props.title}
            </h2>
            <ol className="grid gap-8 pt-12 md:grid-cols-4">
              {items.map((item, index) => (
                <li key={item.title} className="relative">
                  <div
                    className="flex h-9 w-9 items-center justify-center text-[14px] font-semibold"
                    style={{
                      background: "var(--accent)",
                      color: "var(--accent-text)",
                      borderRadius: "999px",
                    }}
                  >
                    {index + 1}
                  </div>
                  {index < items.length - 1 && (
                    <span
                      className="absolute left-9 top-4 hidden h-px md:block"
                      style={{ right: "-2rem", background: "var(--border)" }}
                    />
                  )}
                  <h3 className="pt-4 text-[16px] font-semibold">{item.title}</h3>
                  <p className="pt-1 text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      );
    },

    Contact: ({ props }) => (
      <section className={`${SECTION} blk-in`}>
        <div className={`${INNER} max-w-3xl`}>
          <h2
            className="text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <dl className="grid gap-6 pt-8 sm:grid-cols-3">
            {(() => {
              const labels = props.labels as { address: string; hours: string; phone: string };
              return [
                [labels.address, props.address],
                [labels.hours, props.hours],
                [labels.phone, props.phone],
              ];
            })().map(([label, value]) => (
              <div key={String(label)}>
                <dt
                  className="text-[12px] uppercase tracking-widest"
                  style={{ color: "var(--muted)" }}
                >
                  {label}
                </dt>
                <dd className="pt-1.5 text-[15px] leading-relaxed">{String(value)}</dd>
              </div>
            ))}
          </dl>
          <p
            className="mt-8 p-4 text-[14px]"
            style={{
              background: "var(--accent-soft)",
              borderRadius: "calc(var(--radius) * 1.4)",
              color: "var(--muted)",
            }}
          >
            {props.note}
          </p>
        </div>
      </section>
    ),


    Comparison: ({ props }) => (
      <section className={`${SECTION} blk-in`}>
        <div className={`${INNER} max-w-3xl`}>
          <h2
            className="text-center text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <div
            className="mt-10 overflow-hidden"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "calc(var(--radius) * 1.4)",
            }}
          >
            <div
              className="grid grid-cols-3 text-[13px] font-medium"
              style={{ background: "var(--surface)" }}
            >
              <div className="p-4" style={{ color: "var(--muted)" }} />
              <div className="p-4" style={{ color: "var(--accent)" }}>
                {props.us}
              </div>
              <div className="p-4" style={{ color: "var(--muted)" }}>
                {props.them}
              </div>
            </div>
            {(props.rows as { label: string; us: string; them: string }[]).map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-3 text-[14px]"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div className="p-4 font-medium">{row.label}</div>
                <div className="p-4 leading-relaxed">{row.us}</div>
                <div className="p-4 leading-relaxed" style={{ color: "var(--muted)" }}>
                  {row.them}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    ),

    Team: ({ props }) => (
      <section className={`${SECTION} blk-in`} style={{ background: "var(--surface)" }}>
        <div className={INNER}>
          <h2
            className="text-center text-3xl font-bold"
            style={{ fontFamily: "var(--display)", letterSpacing: "var(--tracking)" }}
          >
            {props.title}
          </h2>
          <div className="grid gap-8 pt-12 md:grid-cols-3">
            {(props.members as { name: string; role: string; bio: string }[]).map((member) => (
              <div key={member.name} className="text-center">
                <div
                  className="mx-auto flex h-16 w-16 items-center justify-center text-[20px] font-semibold"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    borderRadius: "999px",
                    fontFamily: "var(--display)",
                  }}
                >
                  {member.name.slice(0, 1)}
                </div>
                <h3 className="pt-4 text-[16px] font-semibold">{member.name}</h3>
                <div className="pt-0.5 text-[13px]" style={{ color: "var(--accent)" }}>
                  {member.role}
                </div>
                <p className="pt-2 text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {member.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    ),

    /** Placeholder that mimics the real block's shape until its copy arrives. */
    Skeleton: ({ props }) => {
      const kind = String(props.kind ?? "section");
      const bar = (w: string, h = "12px") => (
        <div
          style={{
            width: w,
            height: h,
            background: "var(--border)",
            borderRadius: "999px",
          }}
        />
      );
      const box = (h: string) => (
        <div
          style={{
            height: h,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "calc(var(--radius) * 1.4)",
          }}
        />
      );

      if (kind === "nav") {
        return (
          <nav
            className="animate-pulse px-8 py-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className={`${INNER} flex items-center justify-between`}>
              {bar("96px", "16px")}
              <div className="hidden gap-6 sm:flex">
                {[48, 48, 48, 48].map((w, i) => (
                  <div key={i}>{bar(`${w}px`)}</div>
                ))}
              </div>
              {bar("88px", "32px")}
            </div>
          </nav>
        );
      }

      if (kind === "hero") {
        return (
          <header
            className="animate-pulse px-8 py-24"
            style={{ background: "linear-gradient(to bottom, var(--hero-from), var(--hero-to))" }}
          >
            <div className={`${INNER} flex flex-col items-center gap-4`}>
              {bar("120px", "14px")}
              {bar("min(560px, 80%)", "44px")}
              {bar("min(440px, 65%)", "18px")}
              <div className="flex gap-3 pt-4">
                {bar("128px", "44px")}
                {bar("112px", "44px")}
              </div>
            </div>
          </header>
        );
      }

      if (kind === "footer") {
        return (
          <footer
            className="animate-pulse px-8 py-12"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className={`${INNER} flex justify-between`}>
              <div className="space-y-2">
                {bar("96px", "16px")}
                {bar("160px")}
              </div>
              <div className="flex gap-10">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>{bar("48px")}</div>
                ))}
              </div>
            </div>
          </footer>
        );
      }

      const columns =
        kind === "pricing" ? 3 : kind === "testimonials" ? 3 : kind === "features" ? 3 : 0;

      return (
        <section
          className={`${SECTION} animate-pulse`}
          style={kind === "cta" ? { background: "var(--band)" } : undefined}
        >
          <div className={`${INNER} flex flex-col items-center gap-6`}>
            {bar("min(280px, 60%)", "28px")}
            {columns > 0 ? (
              <div className={`grid w-full gap-6 md:grid-cols-${columns}`}>
                {Array.from({ length: columns }).map((_, i) => (
                  <div key={i}>{box(kind === "pricing" ? "288px" : "144px")}</div>
                ))}
              </div>
            ) : (
              <div className="w-full max-w-3xl space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>{box("56px")}</div>
                ))}
              </div>
            )}
          </div>
        </section>
      );
    },
  },
  actions: {},
});
