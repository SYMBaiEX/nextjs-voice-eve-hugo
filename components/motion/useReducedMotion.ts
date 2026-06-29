"use client";

import { useCallback, useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * useReducedMotion — SSR-safe subscription to the user's
 * `prefers-reduced-motion` setting.
 *
 * Built on `useSyncExternalStore` so it reads the live media-query value
 * without ever calling `setState` inside an effect (the project's ESLint
 * config forbids that). The server snapshot is `false`, so SSR and the first
 * client render agree (no hydration mismatch), then React reconciles to the
 * real value and stays subscribed to changes. Consumers use the boolean to
 * swap rich motion sequences for instant / opacity-only reveals.
 */
export function useReducedMotion(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return () => {};
    }
    const media = window.matchMedia(QUERY);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  }, []);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
