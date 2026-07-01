"use client";

import { useEffect, useState } from "react";

/**
 * useExitAnimation — keeps a conditionally-rendered element mounted for
 * `durationMs` after `open` flips false, so a CSS exit animation (e.g.
 * `.animate-fall`) has time to play instead of the element vanishing
 * instantly. Mirrors the existing `.animate-rise` entrance pattern with a
 * symmetric delayed-unmount on close. Shared by every dialog/menu that
 * conditionally renders on `open` (`ApiKeyDialog`, TopNav's `UserMenu`,
 * `ModelMenu`) so this logic exists once.
 */
export function useExitAnimation(open: boolean, durationMs = 180): boolean {
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    function show() {
      setRendered(true);
    }
    if (open) {
      show();
      return;
    }
    const timer = setTimeout(() => setRendered(false), durationMs);
    return () => clearTimeout(timer);
  }, [open, durationMs]);

  return rendered;
}
