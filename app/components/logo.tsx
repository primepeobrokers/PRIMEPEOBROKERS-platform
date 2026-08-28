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
  return <Cube size={size} color={variant === "onAccent" ? "#FFFFFF" : "#FF2D00"} />;
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
  const ink = onDark ? "#FFFFFF" : "#19233B";
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
      <Cube size={size} color={variant === "onAccent" ? "#FFFFFF" : "#FF2D00"} />
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
