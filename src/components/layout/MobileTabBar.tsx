"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { NAV_ITEMS, NEW_EXPENSE_HREF, isNavActive, type NavItem } from "@/components/layout/nav";
import { cn } from "@/components/ui/cn";

interface MobileTabBarProps {
  /** Opens the navigation drawer (everything not in the bar). */
  onMore: () => void;
  moreOpen: boolean;
}

const tab = cn(
  "relative flex min-h-12 flex-col items-center justify-center gap-[3px] rounded-control text-[11px] transition-colors duration-140",
  "before:absolute before:-top-[7px] before:left-1/2 before:h-[3px] before:w-7 before:-translate-x-1/2 before:rounded-b-[3px]"
);

const TABS = ["/dashboard", "/dashboard/expenses", "/dashboard/trips"].map(
  (href) => NAV_ITEMS.find((item) => item.href === href)!
);

const tabActive = "font-semibold text-accent before:bg-accent";
const tabIdle = "text-ink-3 hover:text-ink";

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(tab, active ? tabActive : tabIdle)}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.5} />
      {item.label}
    </Link>
  );
}

/** Fixed 5-slot bar below lg: Overview, Expenses, Add, Trips, More. */
export default function MobileTabBar({ onMore, moreOpen }: MobileTabBarProps) {
  const pathname = usePathname();
  const [overview, expenses, trips] = TABS;
  // "New expense" lives under /expenses but the Add button, not the tab, represents it.
  const onNew = pathname === NEW_EXPENSE_HREF;
  // Pages reached through the drawer (Assets, Settings, Profile...) light up More.
  const moreActive = !onNew && !TABS.some((item) => isNavActive(pathname, item.href));

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-rule bg-surface px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden"
    >
      <Tab item={overview} active={isNavActive(pathname, overview.href)} />
      <Tab item={expenses} active={!onNew && isNavActive(pathname, expenses.href)} />
      <Link
        href={NEW_EXPENSE_HREF}
        aria-label="New expense"
        aria-current={onNew ? "page" : undefined}
        className="flex h-12 w-[52px] items-center justify-center justify-self-center rounded-[10px] bg-accent text-accent-ink shadow-fab transition-colors duration-140 hover:bg-accent-hover"
      >
        <Plus aria-hidden="true" size={20} strokeWidth={2} />
      </Link>
      <Tab item={trips} active={isNavActive(pathname, trips.href)} />
      <button
        type="button"
        onClick={onMore}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        className={cn(tab, "cursor-pointer", moreActive ? tabActive : tabIdle)}
      >
        <Menu aria-hidden="true" size={20} strokeWidth={1.5} />
        More
      </button>
    </nav>
  );
}
