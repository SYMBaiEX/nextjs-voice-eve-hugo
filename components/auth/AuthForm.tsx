"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { toast } from "sonner";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { OrbSlot } from "@/components/hugo/OrbSlot";
import { useAuthTransition } from "@/components/providers/ConvexClientProvider";

type AuthMode = "signIn" | "signUp";

const COPY: Record<
  AuthMode,
  {
    title: string;
    subtitle: string;
    submit: string;
    pending: string;
    switchPrompt: string;
    switchLabel: string;
    switchHref: string;
  }
> = {
  signIn: {
    title: `Welcome back to ${APP_NAME}`,
    subtitle: "Sign in to pick up your conversations.",
    submit: "Sign in",
    pending: "Signing in…",
    switchPrompt: "New here?",
    switchLabel: "Create an account",
    switchHref: "/sign-up",
  },
  signUp: {
    title: `Create your ${APP_NAME} account`,
    subtitle: APP_TAGLINE,
    submit: "Create account",
    pending: "Creating account…",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/sign-in",
  },
};

/**
 * AuthForm — email/password auth via Convex Auth's password provider. Handles
 * both sign in and sign up flows. On success it routes to the `next` param (or
 * /chat); on failure it surfaces a friendly toast. The submit button shows a
 * spinner and disables all inputs while the request is in flight.
 */
export function AuthForm({ mode }: { mode: AuthMode }) {
  const { signIn } = useAuthActions();
  const { clearSignOut } = useAuthTransition();
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = COPY[mode];

  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();

    if (!email || !password) {
      toast.error("Email and password are required.");
      return;
    }
    if (mode === "signUp" && password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await signIn("password", {
        email,
        password,
        ...(mode === "signUp" ? { name, flow: "signUp" } : { flow: "signIn" }),
      });
      clearSignOut();
      const next = searchParams.get("next");
      router.push(next && next.startsWith("/") ? next : "/chat");
    } catch {
      toast.error(
        mode === "signUp"
          ? "Could not create your account. That email may already be in use."
          : "Invalid email or password.",
      );
      setSubmitting(false);
    }
  }

  const switchHref = (() => {
    const next = searchParams.get("next");
    return next ? `${copy.switchHref}?next=${encodeURIComponent(next)}` : copy.switchHref;
  })();

  return (
    <div className="panel animate-rise w-full max-w-sm p-7 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <OrbSlot state="idle" size={72} />
        <h1 className="mt-5 text-lg font-semibold tracking-tight text-text-primary">
          {copy.title}
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">{copy.subtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
        {mode === "signUp" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              disabled={submitting}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            disabled={submitting}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signUp" ? "new-password" : "current-password"}
            required
            minLength={mode === "signUp" ? 8 : undefined}
            placeholder="••••••••"
            disabled={submitting}
          />
          {mode === "signUp" && (
            <p className="text-xs text-text-muted">At least 8 characters.</p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="mt-1 w-full"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <>
              <Spinner className="border-black/30 border-t-black" />
              {copy.pending}
            </>
          ) : (
            copy.submit
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        {copy.switchPrompt}{" "}
        <Link
          href={switchHref}
          className="font-medium text-hugo-cyan outline-none transition-opacity hover:opacity-80 focus-visible:underline"
        >
          {copy.switchLabel}
        </Link>
      </p>
    </div>
  );
}
