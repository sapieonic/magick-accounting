import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These run from node_modules, not the bundled server output
  // (@react-pdf/renderer for PDF generation, mupdf is a WASM module).
  serverExternalPackages: ["@react-pdf/renderer", "mupdf"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
