"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, LogOut, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import BrandLogo from "@/components/layout/BrandLogo";
import Avatar from "@/components/ui/Avatar";
import { ADMIN_ITEMS, NAV_ITEMS, PROFILE_ITEM, isNavActive, type NavItem } from "@/components/layout/nav";
import { cn } from "@/components/ui/cn";
import pkg from "../../../package.json";

interface SidebarProps {
  /** Mobile drawer state (the desktop rail is always shown from lg up). */
  open: boolean;
  onClose: () => void;
}

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

const ROLE_LABEL = { master_admin: "Master admin", admin: "Admin", user: "Member" } as const;

/** Light focus ring: the global indigo ring is too dark on the rail. */
const railFocus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rail-mark";

const railIconButton = cn(
  "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-control text-rail-muted",
  "transition-colors duration-140 hover:bg-rail-hover hover:text-white",
  railFocus
);

function RailLink({
  item,
  active,
  iconOnly,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  iconOnly: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={iconOnly ? item.label : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-2.5 rounded-control text-sm transition-colors duration-140",
        railFocus,
        iconOnly ? "justify-center" : "px-3",
        active
          ? "bg-rail-active font-medium text-white shadow-[inset_0_0_0_1px_rgba(155,165,248,.22)] before:absolute before:inset-y-[13px] before:left-0 before:w-[3px] before:rounded-r-[3px] before:bg-rail-mark"
          : "text-rail-ink hover:bg-rail-hover"
      )}
    >
      <Icon
        aria-hidden="true"
        size={18}
        strokeWidth={1.5}
        className={cn("shrink-0", active ? "text-rail-icon" : "text-rail-muted")}
      />
      {iconOnly ? <span className="sr-only">{item.label}</span> : <span className="ell flex-1">{item.label}</span>}
    </Link>
  );
}

function RailGroup({ label, iconOnly, children }: { label: string; iconOnly: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="cap px-2.5 text-rail-muted">{label}</span>
      )}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function RailContent({
  iconOnly,
  control,
  onNavigate,
}: {
  iconOnly: boolean;
  /** Collapse toggle (desktop) or close button (drawer), right of the logo. */
  control: ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { isAdmin, user, logout } = useAuth();
  const link = (item: NavItem) => (
    <li key={item.href}>
      <RailLink item={item} active={isNavActive(pathname, item.href)} iconOnly={iconOnly} onNavigate={onNavigate} />
    </li>
  );
  const profileActive = isNavActive(pathname, PROFILE_ITEM.href);

  return (
    <div className={cn("flex h-full flex-col gap-6 py-5", iconOnly ? "px-3" : "px-3.5")}>
      <div className={cn("flex gap-2", iconOnly ? "flex-col items-center" : "items-center pl-1.5")}>
        <Link href="/dashboard" onClick={onNavigate} className={cn("min-w-0 rounded-control", railFocus)}>
          <BrandLogo variant="onDark" compact={iconOnly} />
        </Link>
        <div className={iconOnly ? undefined : "ml-auto"}>{control}</div>
      </div>

      <nav aria-label="Primary" className="-mx-1 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-1">
        <RailGroup label="Workspace" iconOnly={iconOnly}>
          {NAV_ITEMS.map(link)}
        </RailGroup>
        {isAdmin && (
          <RailGroup label="Admin" iconOnly={iconOnly}>
            {ADMIN_ITEMS.map(link)}
          </RailGroup>
        )}
      </nav>

      <div className="flex flex-col gap-1 border-t border-rail-line pt-2">
        <div className={cn("flex items-center gap-1", iconOnly && "flex-col")}>
          <Link
            href={PROFILE_ITEM.href}
            onClick={onNavigate}
            aria-current={profileActive ? "page" : undefined}
            title={iconOnly ? "Profile" : undefined}
            className={cn(
              "flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-control text-white transition-colors duration-140 hover:bg-rail-hover",
              railFocus,
              iconOnly ? "justify-center" : "px-2.5",
              profileActive && "bg-rail-active"
            )}
          >
            <Avatar name={user?.name} photoURL={user?.photoURL} tone="rail" />
            {iconOnly ? (
              <span className="sr-only">Profile</span>
            ) : (
              <span className="flex min-w-0 flex-col">
                <span className="ell text-[13px] font-medium">{user?.name ?? "Profile"}</span>
                <span className="ell text-xs text-rail-muted">
                  {user ? `${ROLE_LABEL[user.role]} · Profile` : "Profile"}
                </span>
              </span>
            )}
          </Link>
          <button type="button" onClick={() => logout()} className={railIconButton} aria-label="Sign out" title="Sign out">
            <LogOut aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
        </div>
        {!iconOnly && <p className="num px-2.5 text-[11px] text-rail-muted">v{pkg.version}</p>}
      </div>
    </div>
  );
}

/** Dark indigo rail (lg+) and the same content as a slide-in drawer below lg. */
export default function Sidebar({ open, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Restore the persisted collapsed state on mount.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true");
    } catch {
      // Storage unavailable (private mode); keep the default.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // Not persisted; the toggle still works for this visit.
      }
      return next;
    });
  };

  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <>
      <aside
        className={cn(
          "hidden h-full shrink-0 bg-rail transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-[72px]" : "w-[232px]"
        )}
      >
        <RailContent
          iconOnly={collapsed}
          control={
            <button
              type="button"
              onClick={toggleCollapsed}
              className={railIconButton}
              aria-label={collapseLabel}
              title={collapseLabel}
            >
              {collapsed ? (
                <ChevronsRight aria-hidden="true" size={16} strokeWidth={1.75} />
              ) : (
                <ChevronsLeft aria-hidden="true" size={16} strokeWidth={1.75} />
              )}
            </button>
          }
        />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="animate-fade-in absolute inset-0 bg-[#0B0B12]/50" onClick={onClose} aria-hidden="true" />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 w-[min(288px,86vw)] bg-rail pb-[env(safe-area-inset-bottom)]">
            <RailContent
              iconOnly={false}
              onNavigate={onClose}
              control={
                <button type="button" onClick={onClose} className={railIconButton} aria-label="Close navigation">
                  <X aria-hidden="true" size={18} strokeWidth={1.75} />
                </button>
              }
            />
          </aside>
        </div>
      )}
    </>
  );
}
