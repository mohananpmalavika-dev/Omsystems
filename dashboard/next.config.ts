import type { NextConfig } from "next";
import path from "path";

// In production (Vercel/Railway), set CONTROL_PLANE_URL to your Railway backend URL.
// Locally defaults to http://localhost:8080.
const apiBase = process.env.CONTROL_PLANE_URL?.replace(/\/$/, "") || "http://localhost:8080";

// Vercel sets VERCEL=1 automatically — no standalone output needed there.
const isVercel = process.env.VERCEL === "1";
const isSitesBuild = process.env.SITES_BUILD === "true";

const nextConfig: NextConfig = {
  // Lets CI and local verification builds avoid colliding with a running dev server.
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  ...(!isVercel && !isSitesBuild ? { output: "standalone" as const } : {}),
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [{ key: "Permissions-Policy", value: "microphone=(self), camera=(self), geolocation=(self)" }],
    }];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBase}/api/v1/:path*`,
      },
      {
        source: "/api/portable-camera/:path*",
        destination: `${apiBase}/api/portable-camera/:path*`,
      },
      {
        source: "/api/ai/:path*",
        destination: `${apiBase}/api/ai/:path*`,
      },
      {
        source: "/v1/:path*",
        destination: `${apiBase}/v1/:path*`,
      },
      {
        source: "/internal/:path*",
        destination: `${apiBase}/internal/:path*`,
      },
    ];
  },
};

export default nextConfig;

