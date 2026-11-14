"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { CornerDownLeft, Plus, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { useDialogLayer } from "@/hooks/useDialogLayer";
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
  { id: "new-expense", label: "Add expense", hint: "Action", icon: Plus, href: NEW_EXPENSE_HREF },
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
  const panelRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
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
    }
  }, [open]);

  // Focus the input, trap Tab, Escape closes only when topmost, focus back to
  // the opener. (aria-modal locks the page scroll, in globals.css.)
  useDialogLayer(open, panelRef, close, { initialFocus: inputRef });

  // Focus stays in the input (aria-activedescendant), so keep the active option in view.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listboxId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex, listboxId]);

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
    }
  };

  if (!open) return null;

  return (
    <div
      // Above the mobile nav drawer (z-50), which it can be opened over.
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="fixed inset-0 bg-overlay/45"
        onClick={close}
        data-testid="command-palette-backdrop"
      />
      <div ref={panelRef} className="animate-slide-up relative w-full max-w-xl overflow-hidden rounded-panel border border-rule bg-surface shadow-elevated">
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
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          />
          <kbd className="num hidden shrink-0 rounded border border-rule bg-sunk px-1.5 py-0.5 text-[11px] text-ink-3 sm:block">
            Esc
          </kbd>
        </div>

        {/* Combobox pattern: options aren't focusable; the input points at the
            active one, and a click runs it (mousedown kept from blurring the input). */}
        <ul
          id={listboxId}
          hidden={results.length === 0}
          className="max-h-[min(22rem,60dvh)] overflow-y-auto p-1.5"
          role="listbox"
          aria-label="Commands"
        >
          {results.map((item, i) => (
            <li
              key={item.id}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(item.href)}
              onMouseMove={() => setActiveIndex(i)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 text-sm transition-colors duration-140",
                i === activeIndex
                  ? "bg-accent-soft text-accent shadow-[inset_3px_0_0_rgb(var(--accent))]"
                  : "text-ink-2"
              )}
            >
              <item.icon aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.hint && <span className="cap shrink-0 text-ink-3">{item.hint}</span>}
              {i === activeIndex && <CornerDownLeft aria-hidden="true" size={14} strokeWidth={1.75} className="shrink-0" />}
            </li>
          ))}
        </ul>
        {results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-ink-3" role="status">
            No matches found
          </p>
        )}
      </div>
    </div>
  );
}
