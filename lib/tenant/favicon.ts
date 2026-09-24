import type { Branding } from "./branding";

/**
 * What a partner's browser-tab icon should be.
 *
 * The client asked for partner sites to show the partner's own logo in the
 * Chrome tab rather than Prime's cube, and that is taken literally here: if a
 * partner has uploaded artwork, that artwork is what appears in the tab.
 *
 * AN EARLIER VERSION GOT THIS WRONG AND IT IS WORTH RECORDING WHY.
 *
 * It reasoned that a favicon is square, that a partner logo is usually a wide
 * wordmark, and that squeezing a 4:1 wordmark into a square makes an
 * unreadable smudge. All true. But it concluded that wide artwork should be
 * DISCARDED in favour of a generated letter tile, and that does not follow:
 * the smudge only happens if you stretch the image to fill the square. Fit it
 * to the width and centre it instead and the logo stays itself, just smaller.
 *
 * The cost of the mistake was total. Measured against the live tenants, every
 * partner holding a logo was wider than the 1.6 threshold, including one at
 * 1.81 that is very nearly square. So the feature shipped as "every partner
 * gets a coloured letter" while the artwork it was supposed to show sat
 * unused in the bucket.
 *
 * So: the logo is used whenever there is one. The letter tile survives only
 * as the genuine no-artwork case, which several partners are in.
 *
 * Prime's cube is never a fallback for a partner. It is the client's
 * trademark, and a partner's domain showing it is the leak this whole
 * white-label effort exists to close.
 */

/** The house accent, used when a partner has set no colour of their own. */
export const DEFAULT_ACCENT = "#ff2d00";

/**
 * Past this ratio the artwork is padded into the square rather than filling
 * it, so a long lockup keeps its proportions instead of being squashed.
 *
 * Both branches show the real logo. This only decides whether the square
 * needs letterboxing, so the number is not load-bearing the way the old
 * use-it-or-discard-it threshold was: getting it slightly wrong changes
 * padding, not whether a partner sees their own brand.
 */
export const FILLS_SQUARE = 1.15;

export type PartnerIcon =
  | { kind: "logo"; path: string; width: number; height: number }
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
 *
 * Artwork wins whenever it exists. The dimensions travel with it because the
 * SVG wrapper needs them to letterbox correctly, and they are already stored
 * on the branding record (parseBranding requires them so the portal header
 * can reserve space).
 */
export function partnerIcon(
  branding: Branding,
  tenantName: string,
): PartnerIcon {
  const logo = branding.logo;

  if (logo && logo.width > 0 && logo.height > 0) {
    return {
      kind: "logo",
      path: logo.path,
      width: logo.width,
      height: logo.height,
    };
  }

  return {
    kind: "letter",
    letter: iconLetter(branding.companyName ?? tenantName),
    accent: branding.colors?.accent ?? DEFAULT_ACCENT,
  };
}

/**
 * Escapes text for inclusion in markup.
 *
 * Both SVG builders below interpolate values into a document. Their inputs
 * are already constrained (iconLetter yields one character, safeColor admits
 * only hex, logoUrl builds from a validated path), so this is defence for the
 * day a future caller skips one of those, not a fix for a known hole.
 */
function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The partner's own logo, wrapped in a square SVG.
 *
 * WHY WRAP IT RATHER THAN SERVE THE PNG DIRECTLY: a browser renders a favicon
 * into a square box. Handed a 2890x358 wordmark it squashes it to fit, and
 * the result is the unreadable smudge that motivated the old letter-tile
 * fallback. Wrapping the image in a square viewBox and giving it
 * preserveAspectRatio lets it letterbox instead: full width, centred, correct
 * proportions, transparent above and below.
 *
 * `<image>` inside SVG is the right primitive here: it composes with the
 * viewBox, so one wrapper handles any source shape.
 *
 * THE IMAGE MUST BE INLINED AS A DATA URI, not referenced by URL. An SVG
 * loaded as an image (which is what a favicon is: a referenced document, not
 * inline markup) runs in a restricted mode that refuses external resources.
 * Verified rather than assumed: a wrapper pointing at the Storage URL loaded
 * as a document, then painted Chrome's broken-image placeholder, and a canvas
 * read of it threw a cross-origin taint error. The route therefore fetches
 * the logo server-side and embeds the bytes.
 *
 * A near-square logo skips the padding and fills the square, because
 * letterboxing something already square just makes it needlessly smaller in a
 * box that is only 16px to begin with.
 */
export function logoIconSvg(
  dataUri: string,
  width: number,
  height: number,
): string {
  const ratio = Math.max(width, height) / Math.min(width, height);
  /*
    xMidYMid meet: scale until the whole image fits, then centre it on both
    axes. "meet" is what letterboxes rather than crops, which matters for a
    wordmark where cropping would cut off half the name.
  */
  const fit = ratio <= FILLS_SQUARE ? "xMidYMid slice" : "xMidYMid meet";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <image href="${esc(dataUri)}" x="0" y="0" width="64" height="64" preserveAspectRatio="${fit}"/>
</svg>`;
}

/**
 * The letter tile, for a partner who has uploaded no artwork at all.
 *
 * SVG rather than a rasterised PNG: it is a few hundred bytes, stays sharp on
 * any display, and needs no image encoder on the server.
 *
 * The letter is drawn with `textLength` so a wide glyph (W, M) and a narrow
 * one (I) occupy the same optical box, which keeps the set of partner tiles
 * looking like one system rather than a ransom note.
 */
export function letterTileSvg(letter: string, accent: string): string {
  const safeLetter = esc(letter);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${safeLetter}">
  <rect width="64" height="64" rx="12" fill="${esc(accent)}"/>
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
