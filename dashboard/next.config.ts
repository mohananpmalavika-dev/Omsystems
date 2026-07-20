import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.SITES_BUILD === "true"
    ? {}
    : { output: "standalone" as const }),
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
