import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

interface StatusPageProps {
  /** Small line above the title, e.g. "404" or "Error"; a status code is set in figures (`num`). */
  eyebrow: string;
  tone: "accent" | "danger";
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
export default function StatusPage({ eyebrow, tone, title, top, children }: StatusPageProps) {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-[var(--pad)] py-8">
      {top}
      <div className="my-auto flex w-full max-w-[420px] flex-col items-start gap-3 self-center py-12">
        <p
          className={cn(
            "text-sm font-medium",
            tone === "danger" ? "text-danger" : "text-accent",
            /^\d+$/.test(eyebrow) && "num"
          )}
        >
          {eyebrow}
        </p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
        {children}
      </div>
    </main>
  );
}
