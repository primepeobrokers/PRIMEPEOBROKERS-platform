import { NextResponse } from "next/server";

import {
  iconLetter,
  letterTileSvg,
  logoIconSvg,
  partnerIcon,
} from "@/lib/tenant/favicon";
import { logoUrl } from "@/lib/tenant/branding";
import { getTenant } from "@/lib/tenant/resolve";

/**
 * The browser-tab icon for a partner's branded pages.
 *
 * A route rather than Next's file-based `icon.tsx` convention, because the
 * icon is per-tenant and resolved from the request Host. The file convention
 * is evaluated per route segment at build time and cannot vary by host.
 *
 * Always SVG, whichever branch runs: either the partner's own artwork
 * letterboxed into a square viewBox, or a letter tile when they have uploaded
 * none.
 *
 * The house site never reaches here: app/favicon.ico serves it, and a request
 * on the apex 404s below.
 */

/**
 * Cap on the logo we are willing to inline.
 *
 * The upload path already limits artwork to 200KB, so this is a backstop
 * against a bucket object that predates that rule or was written by hand.
 * Base64 inflates by about a third, and a favicon response measured in
 * megabytes would be absurd for a 16px slot.
 */
const MAX_INLINE_BYTES = 300_000;

/** How long to wait on Storage before giving up and drawing the tile. */
const FETCH_TIMEOUT_MS = 2_500;

export async function GET() {
  const tenant = await getTenant();

  /*
    404 rather than falling back to Prime's cube. A partner host that cannot
    resolve its tenant must not start flying the house flag, which is the
    exact leak the branded-homepage work exists to close. A missing favicon is
    a blank square; the wrong favicon is someone else's trademark.
  */
  if (!tenant || tenant.isHouse) {
    return new NextResponse(null, { status: 404 });
  }

  const icon = partnerIcon(tenant.branding, tenant.name);

  let body: string | null = null;

  if (icon.kind === "logo") {
    /*
      The bytes have to be embedded, not linked.

      An SVG loaded as an IMAGE (which is exactly what a favicon is: a
      referenced document, not inline markup) runs in a restricted mode that
      refuses to load external resources. A wrapper pointing at the Storage
      URL therefore rendered as Chrome's broken-image glyph. Verified in a
      browser, not assumed: the SVG itself loaded at 64x64, but a canvas read
      threw a cross-origin taint error and the rasterised result was the
      placeholder.

      So fetch it here, server-side, and inline it as a data URI.
    */
    body = await inlineLogo(logoUrl(icon.path), icon.width, icon.height);
  }

  /*
    The tile is the fallback for two different situations: a partner who has
    uploaded no artwork, and a logo we could not fetch or that was too large.
    Both want the same thing, a legible mark in the partner's own colour,
    rather than an empty square.
  */
  if (body === null) {
    /*
      iconLetter, not charAt(0): it skips leading punctuation and whitespace
      and uppercases locale-independently, which charAt does not. Using the
      raw first character here would mean a partner whose logo failed to
      fetch gets a different tile from one who never uploaded artwork at all.
    */
    const letter =
      icon.kind === "letter"
        ? icon.letter
        : iconLetter(tenant.branding.companyName ?? tenant.name);
    const accent =
      icon.kind === "letter"
        ? icon.accent
        : (tenant.branding.colors?.accent ?? "#ff2d00");
    body = letterTileSvg(letter, accent);
  }

  return new NextResponse(body, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      /*
        Cached, but revalidated. A partner replacing their logo or changing
        their accent should see the tab follow within the hour, while the
        common case costs nothing. Favicons are fetched aggressively and are
        not worth a function invocation, plus a Storage round trip, each time.
      */
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

/**
 * Fetches the logo and returns it wrapped as an SVG, or null to fall back.
 *
 * Null rather than throwing on every failure path: a tab icon is the least
 * important thing on the page, and a partner whose Storage object has gone
 * missing should still get their letter tile rather than a 500 or a blank
 * square.
 */
async function inlineLogo(
  url: string,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Storage serves this with its own long cache; no need to bypass it.
      cache: "force-cache",
    });
    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "";
    // The upload path admits PNG and WebP only. Anything else here means the
    // object is not what the branding record claims, so do not embed it.
    if (!/^image\/(png|webp)$/.test(type)) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_INLINE_BYTES) return null;

    const base64 = Buffer.from(buf).toString("base64");
    return logoIconSvg(`data:${type};base64,${base64}`, width, height);
  } catch {
    // Timeout, DNS, TLS, abort: all the same answer, draw the tile instead.
    return null;
  }
}
