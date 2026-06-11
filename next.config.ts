import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: "/",
        destination: "/landing.html",
      },
      // Next.js 16 dev: `(platform)` route group conflicts with `/api/platform/*` — cron is canonical.
      {
        source: "/api/platform/:path*",
        destination: "/api/cron/:path*",
      },
    ];
  },
};

export default nextConfig;
