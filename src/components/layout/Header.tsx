"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus, Search } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import BrandLogo from "@/components/layout/BrandLogo";
import Button, { IconButton } from "@/components/ui/Button";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/ui/CommandPalette";
import { NEW_EXPENSE_HREF, currentSection } from "@/components/layout/nav";
import { cn } from "@/components/ui/cn";
import { transition } from "@/components/ui/styles";

const openPalette = () => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));

/** Top bar: page context, ⌘K search, theme toggle and the persistent New expense button. */
export default function Header() {
  const pathname = usePathname();
  const section = currentSection(pathname);

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-rule bg-background px-[var(--pad)] py-2.5 sm:gap-3">
      <div className="mr-auto flex min-w-0 items-center gap-2.5 lg:mr-0">
        <Link href="/dashboard" className="shrink-0 rounded-control lg:hidden">
          <BrandLogo compact size="sm" />
        </Link>
        {section && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="hidden text-ink-3 sm:inline">{section.group}</span>
            <ChevronRight aria-hidden="true" size={14} strokeWidth={1.75} className="hidden shrink-0 text-ink-3 sm:block" />
            <span className="ell font-semibold text-ink">{section.label}</span>
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={openPalette}
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          "hidden h-11 min-w-0 max-w-[520px] flex-[1_1_240px] cursor-pointer items-center gap-2 rounded-control border border-rule bg-surface px-3 text-left text-ink-3 hover:border-accent-line md:flex lg:ml-4",
          transition
        )}
      >
        <Search aria-hidden="true" size={16} strokeWidth={1.5} className="shrink-0" />
        <span className="ell flex-1">Search expenses, trips, people</span>
        <kbd className="num shrink-0 rounded border border-rule bg-sunk px-1.5 py-0.5 text-[11px]">⌘K</kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-auto">
        <IconButton icon={Search} onClick={openPalette} aria-label="Search" className="md:hidden" />
        <ThemeToggle />
        {pathname !== NEW_EXPENSE_HREF && (
          <Button href={NEW_EXPENSE_HREF} icon={Plus} className="hidden lg:inline-flex">
            New expense
          </Button>
        )}
      </div>
    </header>
  );
}
