import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer must run from node_modules, not the bundled server output.
  serverExternalPackages: ["@react-pdf/renderer"],
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
