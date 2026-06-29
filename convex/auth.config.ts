/**
 * Convex Auth deployment config. The Convex backend verifies its own JWTs
 * issued by @convex-dev/auth against this deployment's site URL.
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
