import { brandingToCss, type Branding } from "@/lib/tenant/branding";

/**
 * Per-tenant palette override.
 *
 * WHY THIS WORKS WITH NO TAILWIND CHANGE
 *
 * Every entry in the `@theme inline` block in app/globals.css is
 * var()-indirected, e.g. `--color-accent: var(--pv-accent)`. The `inline`
 * keyword makes Tailwind emit `var(--pv-accent)` into `.bg-accent` rather than
 * inlining the literal hex, so overriding the --pv-* layer here retints every
 * utility in the app, plus the color-mix-derived badge tones, the focus ring,
 * ::selection, and NextTopLoader. Removing `inline` from that block would
 * silently break per-tenant theming.
 *
 * WHY :root AND NOT A WRAPPER
 *
 * Several rules in globals.css target [data-slot="dialog-overlay"] and
 * friends, which Radix portals to document.body. A wrapper div would never
 * reach them, so a partner's dialogs would keep the house palette.
 *
 * WHY <style precedence> AND NOT useEffect
 *
 * `precedence` is the React 19 API that hoists a style into <head> and dedupes
 * it. Because this is server-rendered in the same response as the markup it
 * colours, the correct palette is present before first paint: there is no
 * flash of house orange. Injecting it from the client, or streaming it in
 * behind a Suspense boundary that the themed content sits outside of, would
 * reintroduce exactly that flash.
 *
 * Renders nothing when the tenant has set no colours, so the house palette
 * from globals.css stands unmodified.
 */
export function TenantTheme({ branding }: { branding: Branding }) {
  const css = brandingToCss(branding);
  if (!css) return null;

  // Every value in `css` has passed the hex allowlist in lib/tenant/branding.ts,
  // which admits no braces, semicolons or parentheses. That is what makes this
  // interpolation safe: React does not escape `}` inside a <style> child,
  // because the content there is CSS rather than HTML.
  return <style precedence="tenant-theme">{`:root{${css}}`}</style>;
}
