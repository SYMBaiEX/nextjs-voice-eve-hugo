import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the Eve agent's instructions/skills markdown ships with the server
  // bundle so lib/ai.ts can read them at runtime on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./agent/hugo/**/*.md"],
  },
};

export default nextConfig;
