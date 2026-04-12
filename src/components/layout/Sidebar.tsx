"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import clsx from "clsx";
import {
  LayoutDashboard,
  Receipt,
  Building2,
  Tag,
  Users,
  Shield,
  X,
} from "lucide-react";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, color: "text-blue-500" },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt, color: "text-emerald-500" },
  { href: "/dashboard/departments", label: "Departments", icon: Building2, color: "text-violet-500" },
  { href: "/dashboard/categories", label: "Categories", icon: Tag, color: "text-amber-500" },
];

const adminItems = [
  { href: "/dashboard/admin/users", label: "Users", icon: Users, color: "text-rose-500" },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Shield, color: "text-slate-500" },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const NavLink = ({ href, label, icon: Icon, color }: { href: string; label: string; icon: typeof LayoutDashboard; color: string }) => (
    <Link
      href={href}
      onClick={onClose}
      className={clsx(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive(href)
          ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/25"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      <Icon className={clsx("h-[18px] w-[18px] flex-shrink-0", isActive(href) ? "text-white" : color)} />
      {label}
    </Link>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-md shadow-brand-500/30">
          M
        </div>
        <span className="text-base font-bold text-gray-900">
          {process.env.NEXT_PUBLIC_APP_NAME || "Magick Accounting"}
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">
          Main
        </p>
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        {isAdmin && (
          <>
            <div className="my-4 border-t border-gray-100" />
            <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">
              Admin
            </p>
            {adminItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </>
        )}
      </nav>

      {/* Sidebar footer decoration */}
      <div className="mx-3 mb-4 rounded-xl bg-gradient-to-br from-brand-50 to-indigo-50 p-4">
        <p className="text-xs font-semibold text-brand-700">Need help?</p>
        <p className="mt-0.5 text-[11px] text-brand-500/70">Contact your administrator for support.</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-gray-100 bg-white/80 backdrop-blur-xl lg:block">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
          <aside className="animate-slide-in-right fixed inset-y-0 left-0 w-72 bg-white shadow-2xl">
            <button
              onClick={onClose}
              className="absolute right-3 top-4 cursor-pointer rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
