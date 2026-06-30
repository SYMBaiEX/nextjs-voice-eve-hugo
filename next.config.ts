import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the Eve agent's instructions/skills markdown ships with the server
  // bundle so lib/ai.ts can read them at runtime on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./agent/hugo/**/*.md"],
  },
  // The conversation history now lives in the chat sidebar; the old standalone
  // pages redirect into the unified chat surface (a conversation opens at
  // /chat?c=<id>).
  async redirects() {
    return [
      { source: "/conversations", destination: "/chat", permanent: false },
      {
        source: "/conversations/:id",
        destination: "/chat?c=:id",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
