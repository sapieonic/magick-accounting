"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";

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
      color: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    },
    user: {
      label: "Member",
      color: "bg-subtle text-muted",
    },
  };

  const badge = user ? roleBadge[user.role] : null;

  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-subtle lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="lg:flex-1" />

      <div className="flex items-center gap-1">
        <ThemeToggle />

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-subtle"
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.name}
                className="h-8 w-8 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-foreground">{user?.name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {dropdownOpen && (
            <div className="animate-fade-in absolute right-0 mt-1 w-64 rounded-xl border border-line bg-surface-elevated py-2 shadow-lg dark:shadow-black/50">
              <div className="border-b border-line px-4 py-3">
                <p className="text-sm font-medium text-foreground">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
                {badge && (
                  <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}>
                    {badge.label}
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-red-600 dark:hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
