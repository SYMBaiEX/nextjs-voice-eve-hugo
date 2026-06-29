import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { Logo } from "@/components/layout/Logo";
import { Skeleton } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Get started",
  description: "Create your Hugo account.",
};

function AuthCardFallback() {
  return (
    <div className="panel w-full max-w-sm space-y-4 p-8">
      <Skeleton className="mx-auto size-16 rounded-full" />
      <Skeleton className="mx-auto h-5 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export default function SignUpPage() {
  return (
    <main className="bg-grid bg-grid-fade relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="absolute left-4 top-5 sm:left-6">
        <Logo />
      </div>
      {/* useSearchParams in AuthForm requires a Suspense boundary. */}
      <Suspense fallback={<AuthCardFallback />}>
        <AuthForm mode="signUp" />
      </Suspense>
      <p className="mt-8 text-center text-xs text-text-muted">
        By continuing you agree to use Hugo responsibly.{" "}
        <Link
          href="/"
          className="text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:underline"
        >
          Back home
        </Link>
      </p>
    </main>
  );
}
