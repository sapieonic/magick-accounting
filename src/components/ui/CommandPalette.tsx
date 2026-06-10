"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Receipt,
  Building2,
  Tag,
  Users,
  Shield,
  FileText,
  Plus,
  Search,
} from "lucide-react";
import clsx from "clsx";

export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  href: string;
  adminOnly?: boolean;
}

const COMMANDS: Command[] = [
  { id: "new-expense", label: "Add Expense", hint: "Action", icon: Plus, href: "/dashboard/expenses/new" },
  { id: "overview", label: "Overview", hint: "Go to", icon: LayoutDashboard, href: "/dashboard" },
  { id: "expenses", label: "Expenses", hint: "Go to", icon: Receipt, href: "/dashboard/expenses" },
  { id: "departments", label: "Departments", hint: "Go to", icon: Building2, href: "/dashboard/departments" },
  { id: "categories", label: "Categories", hint: "Go to", icon: Tag, href: "/dashboard/categories" },
  { id: "invoices", label: "Invoices", hint: "Go to", icon: FileText, href: "/dashboard/invoices", adminOnly: true },
  { id: "users", label: "Users", hint: "Go to", icon: Users, href: "/dashboard/admin/users", adminOnly: true },
  { id: "settings", label: "Settings", hint: "Go to", icon: Shield, href: "/dashboard/admin/settings", adminOnly: true },
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

    const items: { id: string; label: string; hint?: string; icon: typeof Search; href: string }[] =
      [...matched];
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
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
        data-testid="command-palette-backdrop"
      />
      <div className="animate-slide-up relative w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface-elevated shadow-2xl dark:shadow-black/60">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
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
            className="w-full bg-transparent py-3.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none"
            aria-label="Search commands"
          />
          <kbd className="hidden flex-shrink-0 rounded-md border border-line bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
            Esc
          </kbd>
        </div>

        <ul className="max-h-80 overflow-y-auto py-2" role="listbox" aria-label="Commands">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No matches found</li>
          ) : (
            results.map((item, i) => (
              <li key={item.id} role="option" aria-selected={i === activeIndex}>
                <button
                  onClick={() => run(item.href)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={clsx(
                    "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                    i === activeIndex ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-muted"
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="flex-shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
                      {item.hint}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
