import { NextResponse } from "next/server";
import { fetchQuery, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

/**
 * GET /api/admin/health (PRD 5.11)
 *
 * Admin-only health probe. The admin check is enforced server-side in the
 * Convex `admin.health` query; non-admins receive 403.
 */
export async function GET() {
  const token = await authToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const health = await fetchQuery(api.admin.health, {}, { token });
    return NextResponse.json({
      ok: true,
      time: health.time,
      gatewayConfigured: !!process.env.AI_GATEWAY_API_KEY,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
}
