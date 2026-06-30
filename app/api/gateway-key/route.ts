import { NextResponse } from "next/server";
import { createGateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { fetchMutation, authToken } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto";

/**
 * POST/DELETE /api/gateway-key — manage the caller's own AI Gateway key (BYOK).
 *
 * POST validates the key against the gateway, encrypts it server-side, and
 * stores only the ciphertext in Convex (the plaintext never persists or returns
 * to the client). DELETE removes it. Admins use the server key and don't need
 * this, but it's available to any authenticated user.
 */

const Body = z.object({ key: z.string().min(8).max(400) });
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  const token = await authToken();
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: "Key storage isn’t configured on the server." },
      { status: 503, headers: NO_STORE },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide a valid AI Gateway key." },
      { status: 400, headers: NO_STORE },
    );
  }
  const key = parsed.data.key.trim();

  // Validate the key actually works against the gateway before storing it.
  try {
    const { models } = await createGateway({ apiKey: key }).getAvailableModels();
    if (!models || models.length === 0) throw new Error("empty catalog");
  } catch {
    return NextResponse.json(
      { error: "That key didn’t work with the AI Gateway — double-check it." },
      { status: 400, headers: NO_STORE },
    );
  }

  const encrypted = encryptSecret(key);
  if (!encrypted) {
    return NextResponse.json(
      { error: "Key storage isn’t configured on the server." },
      { status: 503, headers: NO_STORE },
    );
  }

  try {
    await fetchMutation(api.users.setGatewayKey, { encrypted }, { token });
  } catch {
    return NextResponse.json(
      { error: "Couldn’t save your key. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE() {
  const token = await authToken();
  if (!token) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  try {
    await fetchMutation(api.users.clearGatewayKey, {}, { token });
  } catch {
    return NextResponse.json(
      { error: "Couldn’t remove your key. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
