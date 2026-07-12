import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.SITES_BUILD === "1" ? {} : { output: "export" as const }),
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
