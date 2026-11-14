import {
  BriefcaseBusiness,
  Building2,
  ChartNoAxesColumn,
  FileText,
  Package,
  ReceiptText,
  SlidersHorizontal,
  Tag,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Workspace links, in rail order. Shared by the rail, tab bar, header and ⌘K. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: ChartNoAxesColumn },
  { href: "/dashboard/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/dashboard/trips", label: "Trips", icon: BriefcaseBusiness },
  { href: "/dashboard/assets", label: "Assets", icon: Package },
  { href: "/dashboard/departments", label: "Departments", icon: Building2 },
  { href: "/dashboard/categories", label: "Categories", icon: Tag },
];

/** Admin-only links. */
export const ADMIN_ITEMS: NavItem[] = [
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/settings", label: "Settings", icon: SlidersHorizontal },
];

export const PROFILE_ITEM: NavItem = { href: "/dashboard/profile", label: "Profile", icon: UserRound };

export const NEW_EXPENSE_HREF = "/dashboard/expenses/new";

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav entry the current page belongs to (longest matching href). */
export function currentSection(pathname: string): (NavItem & { group: "Workspace" | "Admin" | "Account" }) | null {
  const all = [
    ...NAV_ITEMS.map((item) => ({ ...item, group: "Workspace" as const })),
    ...ADMIN_ITEMS.map((item) => ({ ...item, group: "Admin" as const })),
    { ...PROFILE_ITEM, group: "Account" as const },
  ];
  return (
    all
      .filter((item) => isNavActive(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}
