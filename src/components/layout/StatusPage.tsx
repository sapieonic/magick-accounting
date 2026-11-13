import type { ReactNode } from "react";

interface StatusPageProps {
  /** Small line above the title, e.g. "404" or "Error". */
  eyebrow: ReactNode;
  title: ReactNode;
  /** Shown above the centred message (the logo). */
  top?: ReactNode;
  /** Explanation and actions under the title. */
  children: ReactNode;
}

/**
 * Full-page message shell for not-found and global-error: no app chrome, so it
 * works when the dashboard layout (or the router) is what failed.
 */
export default function StatusPage({ eyebrow, title, top, children }: StatusPageProps) {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-[var(--pad)] py-8">
      {top}
      <div className="my-auto flex w-full max-w-[420px] flex-col items-start gap-3 self-center py-12">
        {eyebrow}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}
