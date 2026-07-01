"use client";

import { ApiKeyDialog } from "@/components/settings/ApiKeyDialog";
import { AI_GATEWAY_KEYS_URL } from "@/lib/constants";

/**
 * GatewayKeyDialog — adds, replaces, or removes the caller's own Vercel AI
 * Gateway key (BYOK), via the shared `ApiKeyDialog`. Posts the plaintext key
 * to `/api/gateway-key`, which validates it against the gateway, encrypts it,
 * and stores only the ciphertext — the key is never returned or shown again.
 */
export function GatewayKeyDialog({
  open,
  onClose,
  hasKey,
}: {
  open: boolean;
  onClose: () => void;
  hasKey: boolean;
}) {
  return (
    <ApiKeyDialog
      open={open}
      onClose={onClose}
      hasKey={hasKey}
      copy={{
        keyLabel: "AI Gateway",
        description:
          "Hugo uses your own Vercel AI Gateway key so your models, usage, and billing stay yours. It’s encrypted at rest and never shown again.",
        endpoint: "/api/gateway-key",
        helpUrl: AI_GATEWAY_KEYS_URL,
        helpLabel: "Generate a key at vercel.com",
        placeholder: "vck_…",
      }}
    />
  );
}
