import "server-only";

export function routeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function statusFromConvexError(error: unknown): number {
  const message = routeErrorMessage(error, "").toLowerCase();
  if (message.includes("unauthorized")) return 401;
  if (message.includes("forbidden")) return 403;
  if (message.includes("not found")) return 404;
  return 500;
}
