"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsLeft, ChevronsRight, LogOut, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { approvalCountLabel, useApprovalCount } from "@/contexts/ApprovalCountContext";
import BrandLogo from "@/components/layout/BrandLogo";
import Avatar from "@/components/ui/Avatar";
import { ADMIN_ITEMS, APPROVALS_HREF, NAV_ITEMS, PROFILE_ITEM, isNavActive, type NavItem } from "@/components/layout/nav";
import { cn } from "@/components/ui/cn";
import { useDialogLayer } from "@/hooks/useDialogLayer";
import { ICON_STROKE, focusRing } from "@/components/ui/styles";
import pkg from "../../../package.json";

interface SidebarProps {
  /** Mobile drawer state (the desktop rail is always shown from lg up). */
  open: boolean;
  onClose: () => void;
}

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

const ROLE_LABEL = { master_admin: "Master admin", admin: "Admin", user: "Member" } as const;

/** The active rail row: the surface, lifted by a hairline (a faint top highlight in dark). */
const railActive = "bg-rail-active font-medium text-ink shadow-lift";

/** A rail row or button on hover: an ink tint and full-strength text. */
const railHover = "hover:bg-tint-2 hover:text-ink";

const railIconButton = cn(
  // 44px in the phone drawer, 40px on the desktop rail (dense secondary control).
  "inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink-3 lg:h-10 lg:w-10",
  "transition-colors",
  railHover,
  focusRing
);

/** Over 99 the count reads "99+" (the accessible name keeps the real number). */
const shownCount = (count: number) => (count > 99 ? "99+" : String(count));

function RailLink({
  item,
  active,
  iconOnly,
  onNavigate,
  count = 0,
  countLabel,
}: {
  item: NavItem;
  active: boolean;
  iconOnly: boolean;
  onNavigate?: () => void;
  /** Items waiting on this page (e.g. approvals): a quiet count, or a dot on the icon-only rail. */
  count?: number;
  /** The count in words, e.g. "4 awaiting approval"; joins the link's accessible name. */
  countLabel?: (count: number) => string;
}) {
  const Icon = item.icon;
  const counted = count > 0;
  const name = counted ? `${item.label}, ${countLabel ? countLabel(count) : count}` : undefined;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={name}
      title={iconOnly ? (counted ? `${item.label} (${countLabel ? countLabel(count) : count})` : item.label) : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-2.5 rounded-control text-sm transition-[background-color,color,box-shadow] lg:min-h-10",
        focusRing,
        iconOnly ? "justify-center" : "px-3",
        active
          ? railActive
          : cn("text-ink-2", railHover)
      )}
    >
      <span className="relative flex shrink-0">
        <Icon
          aria-hidden="true"
          size={18}
          strokeWidth={ICON_STROKE}
          // The accent marks the selection: the active icon carries it (>= 3:1 cue).
          className={active ? "text-accent" : "text-ink-3"}
        />
        {iconOnly && counted && (
          <span
            aria-hidden="true"
            data-testid="rail-count-dot"
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-accent"
          />
        )}
      </span>
      {iconOnly ? <span className="sr-only">{item.label}</span> : <span className="ell flex-1">{item.label}</span>}
      {!iconOnly && counted && (
        <span
          aria-hidden="true"
          className="num shrink-0 text-xs font-medium text-accent"
        >
          {shownCount(count)}
        </span>
      )}
    </Link>
  );
}

function RailGroup({ label, iconOnly, children }: { label: string; iconOnly: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {iconOnly ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="cap px-3 text-ink-3">{label}</span>
      )}
      <ul className="flex flex-col gap-1">{children}</ul>
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
  const { count: approvalCount } = useApprovalCount();
  const link = (item: NavItem) => (
    <li key={item.href}>
      <RailLink
        item={item}
        active={isNavActive(pathname, item.href)}
        iconOnly={iconOnly}
        onNavigate={onNavigate}
        {...(item.href === APPROVALS_HREF ? { count: approvalCount, countLabel: approvalCountLabel } : {})}
      />
    </li>
  );
  const profileActive = isNavActive(pathname, PROFILE_ITEM.href);

  return (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <div className={cn("flex gap-2", iconOnly ? "flex-col items-center" : "items-center pl-3")}>
        <Link href="/dashboard" onClick={onNavigate} className={cn("min-w-0 rounded-control", focusRing)}>
          <BrandLogo compact={iconOnly} />
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
              "flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-control py-2 text-ink transition-[background-color,box-shadow]",
              focusRing,
              iconOnly ? "justify-center" : "px-3",
              profileActive ? railActive : railHover
            )}
          >
            <Avatar name={user?.name} photoURL={user?.photoURL} tone="rail" />
            {iconOnly ? (
              <span className="sr-only">Profile</span>
            ) : (
              <span className="flex min-w-0 flex-col">
                <span className="ell text-[13px] font-medium" title={user?.name}>
                  {user?.name ?? "Profile"}
                </span>
                {/* Wraps after the dot rather than truncating on the 232px rail:
                    "Master admin ·" / "Profile". */}
                <span className="text-xs leading-4 text-ink-3">
                  {user ? (
                    <>
                      <span className="whitespace-nowrap">{ROLE_LABEL[user.role]}</span> ·{" "}
                      <span className="whitespace-nowrap">Profile</span>
                    </>
                  ) : (
                    "Profile"
                  )}
                </span>
              </span>
            )}
          </Link>
          <button type="button" onClick={() => logout()} className={railIconButton} aria-label="Sign out" title="Sign out">
            <LogOut aria-hidden="true" size={18} strokeWidth={ICON_STROKE} />
          </button>
        </div>
        {!iconOnly && <p className="num px-3 text-xs text-ink-3">v{pkg.version}</p>}
      </div>
    </div>
  );
}

/** The persisted collapsed state. The shell renders only on the client (behind auth), so it can be read on first render. */
function readCollapsed(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    // Storage unavailable (private mode); keep the default.
    return false;
  }
}

/** The rail (lg+), a step below the page, and the same content as a slide-in drawer below lg. */
export default function Sidebar({ open, onClose }: SidebarProps) {
  // Initialised synchronously so the rail doesn't animate 232 -> 72px on every load.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const drawerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const lastPathname = useRef(pathname);

  // Focus into the drawer, trap Tab, Escape closes it, focus back to "More". (aria-modal locks the page scroll.)
  useDialogLayer(open, drawerRef, onClose);

  // The drawer is lg:hidden: left open across the breakpoint it would keep
  // trapping keys while invisible, so close it once the rail takes over
  // (watched only while it is open).
  useEffect(() => {
    if (!open || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    if (desktop.matches) {
      onClose();
      return;
    }
    const closeAtDesktop = () => {
      if (desktop.matches) onClose();
    };
    desktop.addEventListener("change", closeAtDesktop);
    return () => desktop.removeEventListener("change", closeAtDesktop);
  }, [open, onClose]);

  // Close the drawer whenever the route changes, however it changed (link, ⌘K, back).
  useEffect(() => {
    if (pathname === lastPathname.current) return;
    lastPathname.current = pathname;
    onClose();
  }, [pathname, onClose]);

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
          "hidden h-full shrink-0 border-r border-rail-line bg-rail transition-[width] duration-200 ease-out lg:block",
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
                <ChevronsRight aria-hidden="true" size={16} strokeWidth={ICON_STROKE} />
              ) : (
                <ChevronsLeft aria-hidden="true" size={16} strokeWidth={ICON_STROKE} />
              )}
            </button>
          }
        />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="animate-fade-in absolute inset-0 bg-overlay/45" onClick={onClose} aria-hidden="true" />
          <aside
            ref={drawerRef}
            tabIndex={-1}
            className="animate-slide-in-left absolute inset-y-0 left-0 w-[min(288px,86vw)] bg-rail pb-[env(safe-area-inset-bottom)] outline-none"
          >
            <RailContent
              iconOnly={false}
              onNavigate={onClose}
              control={
                <button type="button" onClick={onClose} className={railIconButton} aria-label="Close navigation">
                  <X aria-hidden="true" size={18} strokeWidth={ICON_STROKE} />
                </button>
              }
            />
          </aside>
        </div>
      )}
    </>
  );
}
