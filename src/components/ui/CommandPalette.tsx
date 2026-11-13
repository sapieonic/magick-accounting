"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { CornerDownLeft, Plus, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { ADMIN_ITEMS, NAV_ITEMS, NEW_EXPENSE_HREF, PROFILE_ITEM, type NavItem } from "@/components/layout/nav";

export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  href: string;
  adminOnly?: boolean;
}

const goTo = (adminOnly: boolean) => (item: NavItem): Command => ({
  id: item.href,
  label: item.label,
  hint: "Go to",
  icon: item.icon,
  href: item.href,
  adminOnly,
});

const COMMANDS: Command[] = [
  { id: "new-expense", label: "Add Expense", hint: "Action", icon: Plus, href: NEW_EXPENSE_HREF },
  ...NAV_ITEMS.map(goTo(false)),
  { ...goTo(false)(PROFILE_ITEM), label: "Profile & Telegram" },
  ...ADMIN_ITEMS.map(goTo(true)),
];

/**
 * Global Cmd/Ctrl+K palette: jump to any page, start a new expense, or search
 * expenses by free text. Also opens via the OPEN_COMMAND_PALETTE_EVENT custom
 * event (used by the header search button).
 */
export default function CommandPalette() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const handleOpenEvent = () => setOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, handleOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus after the dialog renders.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const trimmed = query.trim();

  const results = useMemo(() => {
    const visible = COMMANDS.filter((c) => !c.adminOnly || isAdmin);
    const matched = trimmed
      ? visible.filter((c) => c.label.toLowerCase().includes(trimmed.toLowerCase()))
      : visible;

    const items: Command[] = [...matched];
    if (trimmed) {
      items.push({
        id: "search-expenses",
        label: `Search expenses for "${trimmed}"`,
        hint: "Search",
        icon: Search,
        href: `/dashboard/expenses?q=${encodeURIComponent(trimmed)}`,
      });
    }
    return items;
  }, [trimmed, isAdmin]);

  const run = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) run(item.href);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="fixed inset-0 bg-[#0B0B12]/45"
        onClick={() => setOpen(false)}
        data-testid="command-palette-backdrop"
      />
      <div className="animate-slide-up relative w-full max-w-xl overflow-hidden rounded-panel border border-rule bg-surface shadow-elevated">
        <div className="flex items-center gap-3 border-b border-rule px-4">
          <Search aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="Search pages or expenses..."
            className="h-12 w-full bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
            aria-label="Search commands"
          />
          <kbd className="num hidden shrink-0 rounded border border-rule bg-sunk px-1.5 py-0.5 text-[11px] text-ink-3 sm:block">
            Esc
          </kbd>
        </div>

        <ul className="max-h-[min(22rem,60dvh)] overflow-y-auto p-1.5" role="listbox" aria-label="Commands">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-ink-3">No matches found</li>
          ) : (
            results.map((item, i) => (
              <li key={item.id} role="option" aria-selected={i === activeIndex}>
                <button
                  onClick={() => run(item.href)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-left text-sm transition-colors duration-140",
                    i === activeIndex
                      ? "bg-accent-soft text-accent shadow-[inset_3px_0_0_rgb(var(--accent))]"
                      : "text-ink-2"
                  )}
                >
                  <item.icon aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="cap shrink-0 text-ink-3">{item.hint}</span>}
                  {i === activeIndex && <CornerDownLeft aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
