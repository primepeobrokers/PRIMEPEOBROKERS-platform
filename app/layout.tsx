import type { Metadata } from "next";
import { Archivo, Libre_Franklin, IBM_Plex_Mono } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

/*
  Only the weights actually rendered. Each one is a separate woff2 that
  next/font preloads, so an unused weight is a render-blocking request for
  bytes nothing draws with.

  Archivo (display): 400 and 700 in the Logo lockup (app/components/logo.tsx),
  600 via the 44 `font-display font-semibold` headings. 500 was never used by
  a utility or inline style, so it is gone. Grep before adding one back.
*/
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const franklin = Libre_Franklin({
  variable: "--font-franklin",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Prime PEO Brokers: PEO, Payroll & HR brokerage",
    template: "%s · Prime PEO Brokers",
  },
  description:
    "Answer six questions about your headcount, payroll setup, and benefits spend. We take that record to the provider market and come back with the math.",
  alternates: { canonical: "/" },
  openGraph: {
    siteName: "Prime PEO Brokers",
    type: "website",
    url: siteUrl,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${franklin.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          Route-change progress. The console navigates between server-rendered
          pages that fetch on the server, so a click can sit for a moment with
          no feedback; this is the acknowledgment.

          Brand orange, since this is a progress indicator rather than body
          text, so the 3.73:1 contrast note does not apply. The default shadow
          is a coloured glow, which this flat world does not use, so it is off.
          Spinner off too: the bar already says "working", and a second
          indicator in the corner is noise.
        */}
        <NextTopLoader
          color="var(--pv-accent)"
          height={2}
          shadow={false}
          showSpinner={false}
          speed={200}
          easing="cubic-bezier(0.16, 1, 0.3, 1)"
        />
        {children}
      </body>
    </html>
  );
}
