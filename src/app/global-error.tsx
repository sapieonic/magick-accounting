"use client";

import "./globals.css";
import { useLayoutEffect } from "react";
import { RotateCcw } from "lucide-react";
import Button from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/styles";
import { applyStoredTheme } from "@/contexts/ThemeContext";
import StatusPage from "@/components/layout/StatusPage";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

// global-error replaces the root layout when an unrecoverable error is thrown,
// so it must render its own <html> and <body> (and load the styles itself).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // When this takes over on the client, React strips the root layout's <html>
  // class and color-scheme; restore the saved theme before paint (no light
  // flash). When it is server-rendered, the boot script in <head> does it.
  useLayoutEffect(() => {
    applyStoredTheme();
  }, []);

  return (
    // The boot script sets the class and color-scheme before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <StatusPage eyebrow="Error" tone="danger" title="Something went wrong">
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
        </StatusPage>
      </body>
    </html>
  );
}
