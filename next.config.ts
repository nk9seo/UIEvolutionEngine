import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local developer tool: every API route is request-time (file system, Xcode,
  // Meta API), so Cache Components / prerendering are not used.
  serverExternalPackages: ["sharp"],
  // No Next.js dev badge in the corner (keeps demo recordings clean).
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
