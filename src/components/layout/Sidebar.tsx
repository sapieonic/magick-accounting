"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import clsx from "clsx";
import {
  LayoutDashboard,
  Receipt,
  Building2,
  Tag,
  Users,
  Shield,
  FileText,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, color: "text-blue-500" },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt, color: "text-emerald-500" },
  { href: "/dashboard/departments", label: "Departments", icon: Building2, color: "text-violet-500" },
  { href: "/dashboard/categories", label: "Categories", icon: Tag, color: "text-amber-500" },
];

const adminItems = [
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText, color: "text-cyan-500" },
  { href: "/dashboard/admin/users", label: "Users", icon: Users, color: "text-rose-500" },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Shield, color: "text-slate-500 dark:text-slate-300" },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Restore the persisted collapsed state on mount.
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      return next;
    });
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const NavLink = ({
    href,
    label,
    icon: Icon,
    color,
    iconOnly,
  }: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    color: string;
    iconOnly: boolean;
  }) => (
    <Link
      href={href}
      onClick={onClose}
      title={iconOnly ? label : undefined}
      className={clsx(
        "group/navlink relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-semibold transition-all duration-300",
        iconOnly ? "justify-center px-0" : "px-3",
        isActive(href)
          ? "bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-soft shadow-brand-900/20"
          : "text-muted hover:bg-subtle/60 hover:text-foreground"
      )}
    >
      <Icon className={clsx("h-[18px] w-[18px] flex-shrink-0 transition-transform duration-300 group-hover/navlink:scale-110", isActive(href) ? "text-white" : color)} />
      {!iconOnly && label}
      {iconOnly && (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background opacity-0 shadow-elevated transition-opacity duration-200 group-hover/navlink:opacity-100">
          {label}
        </span>
      )}
    </Link>
  );

  // `iconOnly` controls the compact desktop rail; the mobile overlay always shows full labels.
  const sidebarContent = (iconOnly: boolean) => (
    <div className="flex h-full flex-col">
      <div
        className={clsx(
          "flex h-20 items-center gap-3",
          iconOnly ? "justify-center px-0" : "px-6"
        )}
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white shadow-soft shadow-brand-500/40">
          M
        </div>
        {!iconOnly && (
          <span className="font-heading truncate text-lg font-bold tracking-tight text-foreground">
            {process.env.NEXT_PUBLIC_APP_NAME || "Magick Accounting"}
          </span>
        )}
      </div>

      <nav className={clsx("flex-1 space-y-1 py-4", iconOnly ? "px-2" : "px-3")}>
        {!iconOnly && (
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
            Main
          </p>
        )}
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} iconOnly={iconOnly} />
        ))}

        {isAdmin && (
          <>
            <div className="my-6 border-t border-line/50" />
            {!iconOnly && (
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                Admin
              </p>
            )}
            {adminItems.map((item) => (
              <NavLink key={item.href} {...item} iconOnly={iconOnly} />
            ))}
          </>
        )}
      </nav>

      {/* Sidebar footer decoration */}
      {!iconOnly && (
        <div className="mx-4 mb-6 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/50 to-white p-4 shadow-sm dark:border-brand-500/10 dark:from-brand-500/5 dark:to-transparent">
          <p className="font-heading text-xs font-bold text-brand-800 dark:text-brand-300">Need help?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-brand-600/70 dark:text-brand-300/60">Contact your administrator for support.</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "relative hidden flex-shrink-0 border-r border-line bg-surface/80 backdrop-blur-xl transition-[width] duration-200 ease-in-out lg:block",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        {sidebarContent(collapsed)}
        <button
          onClick={toggleCollapsed}
          className="absolute -right-3 top-[1.55rem] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted-foreground shadow-sm transition-colors hover:text-brand-600 dark:hover:text-brand-400"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
      </aside>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <aside className="animate-slide-in-right fixed inset-y-0 left-0 w-72 bg-surface shadow-2xl">
            <button
              onClick={onClose}
              className="absolute right-3 top-4 cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-subtle hover:text-muted"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent(false)}
          </aside>
        </div>
      )}
    </>
  );
}
