import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { target24 } from "@/components/ui/styles";

export interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: ReactNode;
  /** Small uppercase caption above the title (ignored when `breadcrumb` is set). */
  eyebrow?: ReactNode;
  /** Trail of parent pages shown above the title; the last item may omit `href`. */
  breadcrumb?: Crumb[];
  /** One line under the title: scope, counts, dates. */
  meta?: ReactNode;
  /** Buttons on the right; wraps under the title on narrow screens. */
  actions?: ReactNode;
  className?: string;
}

/** Page title block: h1 + optional breadcrumb/eyebrow, meta line and actions. */
export default function PageHeader({ title, eyebrow, breadcrumb, meta, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {breadcrumb?.length ? (
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-3">
              {breadcrumb.map((crumb, i) => (
                <Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 && (
                    <li aria-hidden="true" className="flex">
                      <ChevronRight size={13} strokeWidth={1.75} />
                    </li>
                  )}
                  <li className="min-w-0">
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className={cn(target24, "text-ink-3 transition-colors duration-140 hover:text-accent")}
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span aria-current="page">{crumb.label}</span>
                    )}
                  </li>
                </Fragment>
              ))}
            </ol>
          </nav>
        ) : (
          eyebrow && <span className="cap text-ink-3">{eyebrow}</span>
        )}
        <h1 className="text-[clamp(22px,2.2vw,28px)] font-semibold leading-tight tracking-[-0.025em] text-ink [text-wrap:balance]">
          {title}
        </h1>
        {meta && <div className="text-sm text-ink-3">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
