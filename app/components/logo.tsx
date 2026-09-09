/**
 * The Prime PEO Brokers mark and lockup.
 *
 * The cube is traced from the brand guide artwork (docs/brand/), so it stays
 * sharp at any size. The wordmark is live text rather than an image: it keeps
 * the lockup crisp, lets it inherit the theme, and stays selectable.
 *
 * `variant` picks the colourway. On navy and orange grounds the type goes
 * white while the cube keeps its orange, exactly as the guide's approved
 * lockups show.
 */

import { logoUrl, type Branding } from "@/lib/tenant/branding";

const CUBE_RATIO = 266 / 298;

/**
 * `accent` is the primary lockup for light grounds. `inverted` is for navy,
 * where the type goes white and the cube keeps its orange. `onAccent` is for
 * orange grounds, where the cube goes white too.
 */
export type Variant = "accent" | "inverted" | "onAccent";

function Cube({ size, color }: { size: number; color: string }) {
  return (
    <svg
      viewBox="0 0 266 298"
      width={Math.round(size * CUBE_RATIO)}
      height={size}
      fill={color}
      fillRule="evenodd"
      aria-hidden="true"
      style={{ flex: "none", display: "block" }}
    >
      <path d="M261.5 91 L261.5 227.3 L145 294 L145 157.7 Z" />
      <path d="M4 91.5 L120 158 L120 185.2 L27.5 132.2 L27.5 159.2 L120.5 212.4 L120.5 239.9 L27 186.4 L27 212.9 L120.5 266.4 L120.5 293.7 L4 227 Z" />
      <path d="M131.8 3.6 L250.4 71.5 L180.7 111.4 L86.6 57.6 L39.8 84.3 L15.3 70.3 Z" />
      <path d="M238 132 L168 172 L168 253.5 L238 213.5 Z" />
      <path d="M86.5 84.3 L157.1 124.7 L133.4 138.3 L62.9 97.8 Z" />
      <path d="M131.9 30.8 L109.6 43.5 L180.4 84 L202.6 71.2 Z" />
      <path d="M215 171.8 L215 199.9 L192 213.1 L192 185 Z" />
    </svg>
  );
}

/**
 * The cube alone. Use where there is no room for the full lockup.
 *
 * `onAccent` is for orange grounds, where the cube goes white so it does not
 * disappear into the background.
 */
export function LogoMark({
  size = 24,
  variant = "accent",
}: {
  size?: number;
  variant?: Variant;
}) {
  return (
    <Cube
      size={size}
      color={variant === "onAccent" ? "#FFFFFF" : "var(--pv-accent)"}
    />
  );
}

/**
 * The full lockup: cube, rule, then PRIME PEO BROKERS set on two lines with
 * PEO bold. Proportions follow the guide artwork, where the type block is
 * about 1.19x the cube height and the rule sits a fifth of a cube width away.
 */
export function Logo({
  size = 28,
  variant = "accent",
}: {
  /** Height of the cube in px. Everything else scales from it. */
  size?: number;
  variant?: Variant;
}) {
  const onDark = variant !== "accent";
  const ink = onDark ? "#FFFFFF" : "var(--pv-ink)";
  const gap = size * 0.2;
  const type = size * 0.29;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        flex: "none",
        lineHeight: 1,
      }}
    >
      <Cube size={size} color={variant === "onAccent" ? "#FFFFFF" : "var(--pv-accent)"} />
      <span
        aria-hidden="true"
        style={{
          width: 1,
          height: size * 0.96,
          background: ink,
          opacity: onDark ? 0.5 : 0.35,
          flex: "none",
        }}
      />
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          gap: type * 0.22,
          fontFamily: "var(--font-archivo), system-ui, sans-serif",
          fontSize: type,
          lineHeight: 1,
          letterSpacing: "0.07em",
          color: ink,
          whiteSpace: "nowrap",
        }}
      >
        <span>
          <span style={{ fontWeight: 400 }}>PRIME </span>
          <span style={{ fontWeight: 700 }}>PEO</span>
        </span>
        <span style={{ fontWeight: 400 }}>BROKERS</span>
      </span>
    </span>
  );
}

/**
 * A tenant's own mark.
 *
 * The house tenant gets the real lockup. A partner gets their uploaded logo
 * if they have one, else a typographic wordmark built from their company
 * name.
 *
 * The fallback matters more than the image path: onboarding a partner must
 * not block on them supplying artwork, so a tenant with empty branding still
 * renders a legible, correctly-coloured identity from day one.
 *
 * The Prime PEO cube is deliberately unreachable for a partner. It is traced
 * from this client's brand guide and is their trademark, not a generic
 * placeholder.
 */
export function TenantMark({
  tenant,
  size = 26,
  variant = "accent",
}: {
  tenant: { isHouse: boolean; name: string; branding: Branding };
  size?: number;
  variant?: Variant;
}) {
  if (tenant.isHouse) return <Logo size={size} variant={variant} />;

  const name = tenant.branding.companyName ?? tenant.name;
  const logo = tenant.branding.logo;

  if (logo) {
    /*
      A plain <img>, not next/image. next.config.ts sets
      images.remotePatterns: [] deliberately (a remote host once blew the
      optimizer's upstream timeout and took the page with it), and one small
      header logo gains almost nothing from optimisation. Intrinsic width and
      height are required by parseBranding precisely so this reserves space
      and does not shift the header on load.
    */
    const h = logo.displayHeight ?? Math.min(size, 32);
    return (
      /* The optimizer is off by design in next.config.ts, and this is one
         small header asset with its intrinsic size already declared. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl(logo.path)}
        width={Math.round((logo.width / logo.height) * h)}
        height={h}
        alt={logo.alt ?? name}
        style={{ display: "block", flex: "none", height: h, width: "auto" }}
      />
    );
  }

  return (
    <span
      style={{
        fontFamily: "var(--font-archivo), system-ui, sans-serif",
        fontSize: size * 0.44,
        fontWeight: 700,
        letterSpacing: "0.02em",
        lineHeight: 1,
        color: variant === "accent" ? "var(--pv-ink)" : "#FFFFFF",
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}
