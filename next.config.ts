import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  // Ensure the in-process Hugo agent's instructions/skills markdown ships with
  // the server bundle so lib/ai.ts can read them at runtime on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./hugo-agent/**/*.md"],
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

// `withEve` runs the Hugo Labs Eve agent (in `agent/`) as a co-located runtime:
// in dev it boots an eve server beside `next dev`; on Vercel it deploys behind
// the web app on the same origin. It rewrites `/eve/v1/*` to that runtime.
export default withEve(nextConfig);
