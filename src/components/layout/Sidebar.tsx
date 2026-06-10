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
        "group/navlink relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-all duration-200",
        iconOnly ? "justify-center px-0" : "px-3",
        isActive(href)
          ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/25"
          : "text-muted hover:bg-subtle hover:text-foreground"
      )}
    >
      <Icon className={clsx("h-[18px] w-[18px] flex-shrink-0", isActive(href) ? "text-white" : color)} />
      {!iconOnly && label}
      {iconOnly && (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity duration-150 group-hover/navlink:opacity-100">
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
          "flex h-16 items-center gap-3",
          iconOnly ? "justify-center px-0" : "px-6"
        )}
      >
        <img
          src="/logo.png"
          alt="Magick Accounting logo"
          className="h-10 w-auto flex-shrink-0 drop-shadow-sm"
        />
        {!iconOnly && (
          <span className="truncate font-display text-base font-bold tracking-tight text-foreground">
            {process.env.NEXT_PUBLIC_APP_NAME || "Magick Accounting"}
          </span>
        )}
      </div>

      <nav className={clsx("flex-1 space-y-1 py-4", iconOnly ? "px-2" : "px-3")}>
        {!iconOnly && (
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Main
          </p>
        )}
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} iconOnly={iconOnly} />
        ))}

        {isAdmin && (
          <>
            <div className="my-4 border-t border-line" />
            {!iconOnly && (
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
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
        <div className="mx-3 mb-4 rounded-xl bg-gradient-to-br from-brand-50 to-accent-50 p-4 dark:from-brand-500/10 dark:to-accent-500/10">
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-300">Need help?</p>
          <p className="mt-0.5 text-[11px] text-brand-600/70 dark:text-brand-300/70">Contact your administrator for support.</p>
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
