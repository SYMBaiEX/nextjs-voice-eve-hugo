"use client";

import { Component, type ReactNode } from "react";

/**
 * ErrorBoundary — renders `fallback` (default nothing) if a child throws during
 * render, so a NON-critical subtree can never take down the surrounding UI.
 *
 * The motivating case: a Convex `useQuery` throws during render on a server
 * error (e.g. a function/index not yet on the deployment the client hit —
 * deploy drift — or a transient failure). Left unguarded, that crashes the
 * whole component tree. Wrapping a nicety (like the tool-call pills feed) in
 * this boundary degrades it to "absent" instead of taking chat/voice down.
 *
 * `resetKey` lets the boundary recover: when it changes (e.g. the active
 * conversation switches, or the deployment catches up on the next mount), the
 * boundary clears its failed state and re-renders the child.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; resetKey?: unknown },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
