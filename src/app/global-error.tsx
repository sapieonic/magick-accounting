"use client";

import "./globals.css";
import { useLayoutEffect } from "react";
import { RotateCcw } from "lucide-react";
import Button from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/styles";
import { applyStoredTheme } from "@/contexts/ThemeContext";

// global-error replaces the root layout when an unrecoverable error is thrown,
// so it must render its own <html> and <body> (and load the styles itself).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // React strips the root layout's <html> class and color-scheme when this
  // takes over; restore the saved theme before paint (no light flash).
  useLayoutEffect(() => {
    applyStoredTheme();
  }, []);

  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <main className="flex min-h-dvh flex-col bg-background px-[var(--pad)] py-8">
          <div className="my-auto flex w-full max-w-[420px] flex-col items-start gap-3 self-center py-12">
            <p className="text-sm font-medium text-danger">Error</p>
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">Something went wrong</h1>
            <p className="text-sm text-ink-3">
              An unexpected error occurred. Please try again — if the problem persists, contact your administrator.
            </p>
            {error?.digest && (
              <p className="text-xs text-ink-3">
                Reference: <span className="num">{error.digest}</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button icon={RotateCcw} onClick={() => reset()}>
                Try again
              </Button>
              {/* A plain link: the app's router may be what failed. */}
              <a href="/dashboard" className={buttonClass({ variant: "ghost" })}>
                Go to dashboard
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
