"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * useMounted — true only after the component has mounted on the client; false
 * during SSR and the first client render.
 *
 * Built on `useSyncExternalStore` (server snapshot `false`, client snapshot
 * `true`) so SSR and the first client paint agree, then it flips to `true` on
 * commit — a hydration-safe way to gate client-only values or markup without
 * the project-forbidden setState-in-effect pattern. Use it to defer
 * browser-only rendering (resolved theme, WebGPU/canvas, time formatting) to
 * after hydration.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
