/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Remote images are optional; add domains once you decide your CDN/source.
    remotePatterns: [],
  },
  poweredByHeader: false,
  reactStrictMode: true,
};
export default nextConfig;
