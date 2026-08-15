import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.SITES_BUILD === "true"
    ? {}
    : { output: "standalone" as const }),
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [{ key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" }],
    }];
  },
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: "http://localhost:8080/v1/:path*",
      },
      {
        source: "/internal/:path*",
        destination: "http://localhost:8080/internal/:path*",
      },
    ];
  },
};

export default nextConfig;
