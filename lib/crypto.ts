import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Authenticated symmetric encryption for secrets at rest (PRD 5.17 security).
 *
 * Used to encrypt per-user AI Gateway keys before they're stored in Convex, so
 * the plaintext never lives in the database and only the server (holding
 * `KEY_ENCRYPTION_SECRET`) can decrypt it. Server-only.
 *
 * AES-256-GCM; the 256-bit key is derived from `KEY_ENCRYPTION_SECRET` via
 * SHA-256. Ciphertext format: `ivHex.tagHex.ctHex`.
 */

function deriveKey(): Buffer | null {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

/** Whether secret encryption is available (the server secret is set). */
export function isEncryptionConfigured(): boolean {
  return !!process.env.KEY_ENCRYPTION_SECRET;
}

/** Encrypt a secret. Returns `ivHex.tagHex.ctHex`, or null if no server secret
 *  is configured (callers should refuse to store the secret in that case). */
export function encryptSecret(plaintext: string): string | null {
  const key = deriveKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${ciphertext.toString("hex")}`;
}

/** Decrypt an `ivHex.tagHex.ctHex` payload. Returns null on any failure
 *  (missing secret, tampering, wrong key, malformed input). */
export function decryptSecret(payload: string): string | null {
  const key = deriveKey();
  if (!key) return null;
  try {
    const [ivHex, tagHex, ctHex] = payload.split(".");
    if (!ivHex || !tagHex || !ctHex) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctHex, "hex")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
