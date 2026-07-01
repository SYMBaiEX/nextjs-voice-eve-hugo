import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { decryptSecret } from "@/lib/crypto";

/**
 * Per-user TinyFish Search API key resolution (BYOK).
 *
 * Mirrors `lib/user-gateway.ts`'s shape for a second, independent secret type.
 * The admin uses the server key (`TINYFISH_API_KEY`); every other user brings
 * their own TinyFish key, decrypted here from the ciphertext Convex stores.
 * Unlike `getUserGateway` (resolved once in a route handler that already has
 * `me` in scope), this is called from deep inside `hugo-agent/tool-logic.ts`'s
 * `searchWeb` tool, which only carries a Convex token — so it looks up the
 * caller's own profile itself rather than requiring one be passed in.
 *
 * No `import "server-only"` (deliberately — Eve's own bundler compiles
 * `tool-logic.ts` too; see `lib/crypto.ts`'s note on the same constraint). The
 * plaintext key never leaves this function; callers only ever see
 * `{ apiKey, configured }`.
 */

export interface UserTinyfishKey {
  apiKey: string | null;
  configured: boolean;
}

export async function getUserTinyfishKey(
  token: string,
): Promise<UserTinyfishKey> {
  const me = await fetchQuery(api.users.currentUser, {}, { token }).catch(
    () => null,
  );
  if (!me) return { apiKey: null, configured: false };

  if (me.role === "admin") {
    const apiKey = process.env.TINYFISH_API_KEY ?? null;
    return { apiKey, configured: !!apiKey };
  }

  if (!me.hasTinyfishKey) {
    return { apiKey: null, configured: false };
  }

  const encrypted = await fetchQuery(
    api.users.tinyfishKeyForSelf,
    {},
    { token },
  ).catch(() => null);
  const apiKey = encrypted ? decryptSecret(encrypted) : null;
  return { apiKey, configured: !!apiKey };
}
