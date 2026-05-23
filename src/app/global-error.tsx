"use client";

// global-error replaces the root layout when an unrecoverable error is thrown,
// so it must render its own <html> and <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-semibold tracking-wide text-red-500">Error</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Something went wrong</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            An unexpected error occurred. Please try again — if the problem persists, contact your
            administrator.
          </p>
          {error?.digest && (
            <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>
          )}
          <button onClick={() => reset()} className="btn-primary mt-6">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
