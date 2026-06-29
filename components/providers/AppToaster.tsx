"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/useMounted";

/**
 * AppToaster — the app's Sonner toaster, themed to follow next-themes.
 *
 * Sonner needs a concrete "light" | "dark" theme, but the resolved theme is only
 * knowable on the client (next-themes reads the <html> class after mount). To
 * stay hydration-stable we render the app's dark default on the server and on
 * the first client paint, then swap to the resolved theme once mounted — a
 * post-mount attribute change, never a hydration mismatch. This fixes toasts
 * rendering with the dark palette while the app is in light mode.
 */
export function AppToaster() {
  const { resolvedTheme } = useTheme();
  const mounted = useMounted();

  const theme = mounted && resolvedTheme === "light" ? "light" : "dark";

  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--surface-elevated)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        },
      }}
    />
  );
}
