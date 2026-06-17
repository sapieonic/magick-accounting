"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, LogOut, ChevronDown, Search } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { OPEN_COMMAND_PALETTE_EVENT } from "@/components/ui/CommandPalette";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const roleBadge = {
    master_admin: {
      label: "Master Admin",
      color: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    },
    admin: {
      label: "Admin",
      color: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    },
    user: {
      label: "Member",
      color: "bg-subtle text-muted",
    },
  };

  const badge = user ? roleBadge[user.role] : null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line/50 bg-surface/80 px-4 backdrop-blur-md lg:px-8">
      <button
        onClick={onMenuClick}
        className="cursor-pointer rounded-xl p-2 text-muted-foreground transition-colors hover:bg-subtle lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="lg:flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))}
          className="flex cursor-pointer items-center gap-2 rounded-xl p-2 text-muted-foreground transition-all duration-200 hover:bg-subtle hover:text-foreground sm:border sm:border-line sm:px-3 sm:py-1.5"
          aria-label="Open search"
          title="Search (Ctrl+K)"
        >
          <Search className="h-4 w-4" />
          <span className="hidden font-heading text-xs font-bold sm:block">Search</span>
          <kbd className="hidden rounded-lg border border-line bg-subtle/60 px-1.5 py-0.5 text-[10px] font-bold sm:block">
            ⌘K
          </kbd>
        </button>
        <ThemeToggle />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 transition-all duration-200 hover:bg-subtle/60"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.name}
                className="h-9 w-9 rounded-full border border-line object-cover shadow-sm transition-transform duration-200 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-100 to-brand-200 text-sm font-bold text-brand-700 shadow-sm transition-transform duration-200 group-hover:scale-105 dark:from-brand-500/20 dark:to-brand-500/30 dark:text-brand-300">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden text-left sm:block">
              <p className="font-heading text-sm font-bold leading-none text-foreground">{user?.name}</p>
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">{user?.email}</p>
            </div>
            <ChevronDown className={clsx("h-4 w-4 text-muted-foreground transition-transform duration-200", dropdownOpen && "rotate-180")} />
          </button>

          {dropdownOpen && (
            <div className="animate-fade-in absolute right-0 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-line bg-surface-elevated shadow-elevated dark:shadow-black/60">
              <div className="border-b border-line bg-subtle/30 px-5 py-4">
                <p className="font-heading text-sm font-bold text-foreground">{user?.name}</p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">{user?.email}</p>
                {badge && (
                  <span className={clsx("mt-3 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", badge.color)}>
                    {badge.label}
                  </span>
                )}
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-muted transition-all duration-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
