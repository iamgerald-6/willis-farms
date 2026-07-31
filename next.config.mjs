/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Remote images are optional; add domains once you decide your CDN/source.
    remotePatterns: [],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  // @react-pdf/renderer breaks when Next bundles it into the server build —
  // its own internal React usage ends up mismatched/minified in a way that
  // throws "Minified React error #31" on every renderToBuffer() call (used
  // by the Task Manager monthly report). Marking it external makes Next
  // load it via plain Node require() instead, exactly like it runs
  // standalone, which is where the crash didn't reproduce.
  serverExternalPackages: ["@react-pdf/renderer"],
};
export default nextConfig;
