"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

/**
 * Wires the reactive Convex client to Convex Auth for the App Router. Auth
 * tokens are managed by Convex Auth's Next.js integration (httpOnly cookies);
 * no secrets are exposed to the browser.
 */
interface AuthTransitionValue {
  canRunProtectedQueries: boolean;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  isSigningOut: boolean;
  beginSignOut: () => void;
  clearSignOut: () => void;
}

const AuthTransitionContext = createContext<AuthTransitionValue | null>(null);

function AuthTransitionProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const value = useMemo<AuthTransitionValue>(
    () => ({
      canRunProtectedQueries: !isSigningOut && isAuthenticated,
      isAuthenticated,
      isAuthLoading: isLoading,
      isSigningOut,
      beginSignOut: () => setIsSigningOut(true),
      clearSignOut: () => setIsSigningOut(false),
    }),
    [isAuthenticated, isLoading, isSigningOut],
  );

  return (
    <AuthTransitionContext.Provider value={value}>
      {children}
    </AuthTransitionContext.Provider>
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
    }
    return new ConvexReactClient(url);
  }, []);

  return (
    <ConvexAuthNextjsProvider client={convex}>
      <AuthTransitionProvider>{children}</AuthTransitionProvider>
    </ConvexAuthNextjsProvider>
  );
}

export function useAuthTransition() {
  const value = useContext(AuthTransitionContext);
  if (!value) {
    throw new Error("useAuthTransition must be used within ConvexClientProvider");
  }
  return value;
}
