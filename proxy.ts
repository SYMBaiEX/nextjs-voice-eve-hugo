import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

/**
 * Next.js 16 proxy (formerly middleware). Provides route-level auth protection
 * for app + admin routes (PRD 5.12). Unauthenticated users hitting a protected
 * route are redirected to sign-in. Admin authorization is additionally enforced
 * server-side in the /admin layout and in every admin Convex function — this
 * proxy is a first gate, not the only one (PRD 5.17).
 */

const isSignInPage = createRouteMatcher(["/sign-in", "/sign-up"]);
const isProtectedRoute = createRouteMatcher([
  "/chat(.*)",
  "/settings(.*)",
  "/admin(.*)",
  "/eve(.*)",
]);
// The Eve showcase runtime is reached at /eve/v1/* (proxied by withEve). It's
// the only gate in front of that runtime, so block unauthenticated callers here
// with a 401 (not a redirect — these are API calls, not page loads).
const isEveApi = createRouteMatcher(["/eve/v1(.*)"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authed = await convexAuth.isAuthenticated();

  if (isSignInPage(request) && authed) {
    return nextjsMiddlewareRedirect(request, "/");
  }

  if (isEveApi(request) && !authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (isProtectedRoute(request) && !authed) {
    const next = encodeURIComponent(request.nextUrl.pathname);
    return nextjsMiddlewareRedirect(request, `/sign-in?next=${next}`);
  }
});

export const config = {
  // Run on everything except static assets and image optimization.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
