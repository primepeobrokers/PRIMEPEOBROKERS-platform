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

/**
 * The cube geometry, as one compound path.
 *
 * EXTRACTED FROM THE BRAND GUIDE, NOT RE-DRAWN. `pdftocairo -svg` on
 * docs/brand/brand-guide.pdf yields the artwork as real vectors; this is that
 * path, translated and scaled into the 266x298 viewBox the lockup already
 * used. Do not hand-edit the coordinates. To change it, re-extract.
 *
 * WHAT WAS WRONG BEFORE, because it is subtle and will otherwise come back:
 * the previous version was seven hand-traced polygons, and it silently lost
 * two of the three letters. The cube is an isometric PEO monogram, one letter
 * per visible face: P on the top, E on the left, O on the right. The trace
 * rendered the top and right faces as solid slabs, so the P had no bowl and
 * the O had no counter, and the mark read as a plain box with an E on it.
 *
 * The counters are holes punched by `fillRule="evenodd"`, so the fill rule
 * is load-bearing. Drop it and the letters fill in again.
 */
const CUBE_PATH =
  "M 145.1 298 L 266 228.55 L 266 89.63 L 145.1 159.08 C 145.1 205.39 145.1 251.7 145.1 298 Z M 36.88 82.67 L 85.24 54.89 C 117.47 73.4 149.71 91.93 181.95 110.45 L 253.29 69.45 C 213 46.31 172.7 23.16 132.41 0 L 12.71 68.78 Z M 133.59 138.23 L 157.77 124.34 L 85.24 82.67 L 61.06 96.56 C 85.24 110.45 109.41 124.34 133.59 138.23 Z M 109.41 41 L 132.41 27.78 C 156.59 41.67 180.76 55.56 204.94 69.45 L 181.95 82.67 Z M 0 89.61 C 0 135.92 0 182.24 0 228.55 C 40.31 251.69 80.61 274.84 120.92 298 L 120.92 270.22 C 88.67 251.7 56.43 233.17 24.18 214.64 L 24.18 186.84 C 56.43 205.38 88.67 223.89 120.92 242.42 L 120.92 214.64 C 88.67 196.11 56.43 177.59 24.18 159.06 L 24.18 131.28 C 56.43 149.81 88.67 168.35 120.92 186.86 L 120.92 159.08 C 80.61 135.92 40.31 112.77 0 89.61 Z M 193.47 214.62 L 217.65 200.75 L 217.65 172.97 L 193.47 186.84 Z M 169.27 256.33 C 169.27 228.55 169.27 200.77 169.27 172.97 L 241.82 131.3 C 241.82 159.08 241.82 186.86 241.82 214.66 Z M 169.27 256.33";

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
      <path d={CUBE_PATH} />
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
