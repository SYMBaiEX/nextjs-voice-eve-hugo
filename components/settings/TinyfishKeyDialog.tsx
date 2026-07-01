"use client";

import { ApiKeyDialog } from "@/components/settings/ApiKeyDialog";
import { TINYFISH_KEYS_URL } from "@/lib/constants";

/**
 * TinyfishKeyDialog — adds, replaces, or removes the caller's own TinyFish
 * Search API key (BYOK), via the shared `ApiKeyDialog`. Posts the plaintext
 * key to `/api/tinyfish-key`, which validates it with a real search call,
 * encrypts it, and stores only the ciphertext.
 */
export function TinyfishKeyDialog({
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
        keyLabel: "TinyFish",
        description:
          "Hugo uses your own TinyFish Search API key so it can search the web for you. It’s encrypted at rest and never shown again.",
        endpoint: "/api/tinyfish-key",
        helpUrl: TINYFISH_KEYS_URL,
        helpLabel: "Get a key at agent.tinyfish.ai",
        placeholder: "sk-tinyfish-…",
      }}
    />
  );
}
