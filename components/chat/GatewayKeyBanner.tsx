"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { ExternalLink, KeyRound, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useAuthTransition } from "@/components/providers/ConvexClientProvider";
import { GatewayKeyDialog } from "@/components/chat/GatewayKeyDialog";
import { AI_GATEWAY_KEYS_URL, OPEN_GATEWAY_KEY_EVENT } from "@/lib/constants";

/**
 * GatewayKeyBanner — the BYOK onboarding nudge (soft gate for VOICE only).
 *
 * Text chat has no gate: a keyless user's text runs on the Eve runtime with
 * the platform's own model. Only realtime voice actually requires the user's
 * own AI Gateway key (Eve has no realtime API, so voice can't route around
 * BYOK the way text now does). Shown only to non-admins who haven't set their
 * own key. Admins use the server key, so they never see it. Dismiss is
 * in-memory (the banner reappears on refresh until a key is set). It also
 * hosts the shared GatewayKeyDialog and opens it on the
 * `OPEN_GATEWAY_KEY_EVENT` window event, so the composer's keyless voice nudge
 * can pop the same dialog. Once a key is saved, Convex reactivity flips
 * `hasGatewayKey` and the whole thing disappears.
 */
export function GatewayKeyBanner() {
  const { canRunProtectedQueries } = useAuthTransition();
  const me = useQuery(
    api.users.currentUser,
    canRunProtectedQueries ? {} : "skip",
  );
  const [dismissed, setDismissed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Let the composer (or anywhere) open the dialog via a window event.
  useEffect(() => {
    function open() {
      setDialogOpen(true);
    }
    window.addEventListener(OPEN_GATEWAY_KEY_EVENT, open);
    return () => window.removeEventListener(OPEN_GATEWAY_KEY_EVENT, open);
  }, []);

  const needsKey = !!me && me.role !== "admin" && !me.hasGatewayKey;
  if (!needsKey) return null;

  return (
    <>
      {!dismissed && (
        <div className="mx-3 mb-1 flex items-center gap-3 rounded-lg border border-hugo-cyan/25 bg-hugo-cyan/5 px-3 py-2">
          <KeyRound aria-hidden className="size-4 shrink-0 text-hugo-cyan" />
          <p className="min-w-0 flex-1 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">
              Bring your own AI Gateway key
            </span>{" "}
            to talk with Hugo over voice — your models and usage stay yours.
          </p>
          <a
            href={AI_GATEWAY_KEYS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 text-xs text-hugo-cyan hover:underline sm:inline-flex"
          >
            Get a key
            <ExternalLink aria-hidden className="size-3" />
          </a>
          <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
            Add key
          </Button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      <GatewayKeyDialog
        open={dialogOpen}
        hasKey={false}
        onClose={() => setDialogOpen(false)}
      />
    </>
  );
}
