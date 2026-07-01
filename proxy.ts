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
]);
// /eve/v1/* (the Eve durable runtime, proxied by withEve) is gated entirely by
// its own channel auth (agent/channels/eve.ts: vercelOidc()/localDev() at the
// route level, plus onMessage requiring Hugo's own bridge headers) — it's
// unreachable from the browser regardless of this proxy, so no gate is needed
// here.

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authed = await convexAuth.isAuthenticated();

  if (isSignInPage(request) && authed) {
    return nextjsMiddlewareRedirect(request, "/");
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
