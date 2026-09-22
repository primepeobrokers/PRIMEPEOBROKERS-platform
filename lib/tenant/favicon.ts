import type { Branding } from "./branding";

/**
 * What a partner's browser-tab icon should be.
 *
 * The client asked for partner sites to show the partner's own logo in the
 * Chrome tab rather than Prime's cube. The complication is that a favicon is
 * rendered at 16 to 32 CSS pixels and is almost always square, while a
 * partner's uploaded logo is usually a wide horizontal wordmark. Scaled into
 * a square, a 4:1 wordmark becomes an unreadable smudge, which looks worse
 * than showing nothing.
 *
 * So the shape decides:
 *
 * - Roughly square artwork is used directly. It was designed to work as a
 *   mark and it survives being shrunk.
 * - Anything wider or taller falls back to a generated tile: the partner's
 *   initial, in white, on their own accent colour. Still unmistakably theirs,
 *   and legible at 16px, which is the only thing a favicon has to do.
 *
 * Prime's cube is never a fallback for a partner. It is the client's
 * trademark, and a partner's domain showing it is the leak this whole
 * white-label effort exists to close.
 */

/**
 * Widest aspect ratio still usable as a square icon.
 *
 * 1.6 admits the common "slightly wide" mark (a monogram with a bit of
 * padding, a shield, a roundel) while rejecting a true horizontal lockup,
 * which starts around 3:1. Picked from the shape of real uploads rather than
 * a round number: at 1.6 a 16px icon still gives each glyph about 10px of
 * height, and below that letterforms stop resolving.
 */
export const SQUARE_ENOUGH = 1.6;

/** The house accent, used when a partner has set no colour of their own. */
export const DEFAULT_ACCENT = "#ff2d00";

export type PartnerIcon =
  | { kind: "logo"; path: string }
  | { kind: "letter"; letter: string; accent: string };

/**
 * The first character to put on a generated tile.
 *
 * Takes the first letter or digit, so "3M" gives "3" and "  acme" gives "A".
 * Falls back to "?" rather than throwing or rendering an empty tile: a tenant
 * named entirely in punctuation or a non-Latin script is rare, but an empty
 * favicon would be a silent blank square with no way to tell it apart from a
 * loading failure.
 *
 * Uppercased with a locale-independent transform, because the tile is
 * geometry, not language: a Turkish locale lowercasing "I" to a dotless glyph
 * would change the artwork based on where the server happens to run.
 */
export function iconLetter(name: string): string {
  const m = name.match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : "?";
}

/**
 * Decides which icon a partner gets. Pure, so the choice is unit-testable
 * without a browser or a network call.
 */
export function partnerIcon(
  branding: Branding,
  tenantName: string,
): PartnerIcon {
  const logo = branding.logo;

  if (logo && logo.width > 0 && logo.height > 0) {
    const ratio =
      Math.max(logo.width, logo.height) / Math.min(logo.width, logo.height);
    if (ratio <= SQUARE_ENOUGH) return { kind: "logo", path: logo.path };
  }

  return {
    kind: "letter",
    letter: iconLetter(branding.companyName ?? tenantName),
    accent: branding.colors?.accent ?? DEFAULT_ACCENT,
  };
}

/**
 * The letter tile as an SVG document.
 *
 * SVG rather than a rasterised PNG: it is a few hundred bytes, stays sharp on
 * any display, and needs no image encoder on the server. Every browser that
 * matters has supported SVG favicons since 2020, and the .ico in app/ remains
 * the fallback for those that do not.
 *
 * The letter is drawn with `textLength` so a wide glyph (W, M) and a narrow
 * one (I) occupy the same optical box, which keeps the set of partner tiles
 * looking like one system rather than a ransom note.
 *
 * `accent` reaches this function only through parseBranding's safeColor,
 * which admits nothing but #rgb / #rrggbb / #rrggbbaa. The caller must not
 * pass a raw database value: this interpolates into markup.
 */
export function letterTileSvg(letter: string, accent: string): string {
  // Escaped defensively. safeColor and iconLetter both constrain their
  // outputs already, so this can only matter if a future caller skips them,
  // which is exactly when it should not become an injection.
  const safeLetter = letter
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${safeLetter}">
  <rect width="64" height="64" rx="12" fill="${accent}"/>
  <text x="32" y="45" text-anchor="middle" textLength="34" lengthAdjust="spacingAndGlyphs"
        font-family="Archivo, Helvetica, Arial, sans-serif" font-size="40" font-weight="700"
        fill="#ffffff">${safeLetter}</text>
</svg>`;
}

/**
 * The `icons` block for a tenant-aware page's metadata.
 *
 * A partner points at /partner-icon, which resolves their logo or tile from
 * the request host. The house tenant (and an unresolved host) returns
 * undefined, which leaves Next's own app/favicon.ico handling untouched:
 * returning an explicit house icon here would override the .ico with a single
 * size and lose the multi-resolution set browsers pick from.
 *
 * Declared on every tenant-aware route rather than in the root layout,
 * because the root layout must not call getTenant(): it reads headers(), and
 * that would make the statically prerendered house marketing page dynamic.
 */
export function tenantIcons(
  tenant: { isHouse: boolean } | null,
):
  | { icon: { url: string; type?: string; sizes?: string }[] }
  | undefined {
  if (!tenant || tenant.isHouse) return undefined;

  /*
    `sizes: "any"` is load-bearing, and the reason is not obvious.

    Next injects app/favicon.ico into EVERY route's head and emits it first,
    tagged `sizes="256x256"`. It is root-only by design (see
    node_modules/next/dist/docs/.../metadata/app-icons.md: "Favicons can only
    be set in the root /app segment"), so a partner route cannot suppress it.
    Left alone, a partner page offers the browser Prime's 256px cube and the
    partner's untagged SVG, and a browser that ranks by declared size picks
    the cube: the exact white-label leak this feature exists to close.

    `sizes="any"` is the spec's "scalable" marker. Chrome and Safari treat a
    candidate marked any as preferred over a fixed-size raster at every
    display density, so the partner's mark wins on merit rather than on
    document order, which nothing here controls.
  */
  return {
    icon: [{ url: "/partner-icon", type: "image/svg+xml", sizes: "any" }],
  };
}
