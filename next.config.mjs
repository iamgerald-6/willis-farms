/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Remote images are optional; add domains once you decide your CDN/source.
    remotePatterns: [],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  logging: {
    // Next.js internally cancels in-flight route/prefetch fetches when you
    // navigate quickly (e.g. browser back/forward). That produces harmless
    // AbortErrors that Next 16 mirrors into this terminal as
    // "[browser] unhandledRejection: AbortError". Turn that mirroring off —
    // it's dev-only noise, not a real bug, and doesn't affect the app.
    browserToTerminal: false,
  },
};
export default nextConfig;
