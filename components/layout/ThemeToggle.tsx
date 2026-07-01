"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

/**
 * ThemeToggle — flips between dark and light via next-themes. Uses a mounted
 * guard so the icon renders only after hydration (server can't know the
 * resolved theme), avoiding a hydration mismatch.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    // Defer to a microtask so the mount flag flips after the first paint,
    // avoiding a synchronous setState inside the effect body.
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isDark = resolvedTheme === "dark";

  // Manual toggle only — disableTransitionOnChange on the provider still
  // handles the initial-load/hydration flash, unrelated to this. A deliberate
  // click gets a soft cross-fade via the browser's native (stable, baseline)
  // View Transitions API when available — not React's experimental
  // <ViewTransition> component, just a plain DOM API.
  function flipTheme() {
    const next = isDark ? "light" : "dark";
    if (reducedMotion || typeof document.startViewTransition !== "function") {
      setTheme(next);
      return;
    }
    document.startViewTransition(() => setTheme(next));
  }

  if (!mounted) {
    // Stable placeholder keeps layout from shifting before hydration.
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        disabled
        className="opacity-0"
      >
        <Sun />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={flipTheme}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
