import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    Landing-page photography is served from public/photography rather than
    fetched from Unsplash at request time.

    The remote originals were reaching Next's image optimizer past its 7s
    upstream timeout (the 2000px warehouse frame measured ~15s), so the
    optimizer returned 500 and the page rendered alt text instead of a photo.
    Local files remove that dependency: no third-party latency, no runtime
    failure mode, and the bytes are versioned with the code.

    remotePatterns is intentionally empty. Adding a host back would let a
    stray remote src reintroduce the same failure without anyone noticing.

    Licence: the photographs are used under the Unsplash licence and the hero
    poster under the Pexels licence, both credited in the site footer.
  */
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
