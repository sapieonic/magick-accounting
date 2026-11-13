import {
  AppWindow,
  Coffee,
  GraduationCap,
  MapPin,
  Megaphone,
  MessageSquare,
  PenLine,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui/cn";

export type CategoryTone = "sw" | "co" | "tr" | "ed" | "me" | "of" | "mk" | "neutral";

interface CategoryStyle {
  icon: LucideIcon;
  /** Glyph colour (text-*). */
  fg: string;
  /** Soft chip background (bg-*). */
  bg: string;
  /** Solid fill for dots and bars (bg-*). */
  fill: string;
}

/** Static class strings per tone (kept literal so Tailwind generates them). */
export const CATEGORY_STYLES: Record<CategoryTone, CategoryStyle> = {
  sw: { icon: AppWindow, fg: "text-cat-sw", bg: "bg-cat-sw-soft", fill: "bg-cat-sw" },
  co: { icon: MessageSquare, fg: "text-cat-co", bg: "bg-cat-co-soft", fill: "bg-cat-co" },
  tr: { icon: MapPin, fg: "text-cat-tr", bg: "bg-cat-tr-soft", fill: "bg-cat-tr" },
  ed: { icon: GraduationCap, fg: "text-cat-ed", bg: "bg-cat-ed-soft", fill: "bg-cat-ed" },
  me: { icon: Coffee, fg: "text-cat-me", bg: "bg-cat-me-soft", fill: "bg-cat-me" },
  of: { icon: PenLine, fg: "text-cat-of", bg: "bg-cat-of-soft", fill: "bg-cat-of" },
  mk: { icon: Megaphone, fg: "text-cat-mk", bg: "bg-cat-mk-soft", fill: "bg-cat-mk" },
  neutral: { icon: Tag, fg: "text-ink-3", bg: "bg-sunk", fill: "bg-ink-3" },
};

// Whole words only ("Facebook ads" is not a book, "Headphones" not a phone).
// First match wins, so a name with keywords from two families takes the earlier one.
const KEYWORDS: [CategoryTone, RegExp][] = [
  ["sw", /\b(software|subscriptions?|saas|cloud|hosting|licen[cs]e[sd]?|licensing|domains?|servers?|apis?)\b/],
  ["co", /\b(communications?|(tele)?phones?|mobiles?|internet|telecom|broadband|wi-?fi)\b/],
  ["ed", /\b(training|education|courses?|learning|books?|certifications?|conferences?)\b/],
  [
    "tr",
    /\b(travel\w*|transport\w*|cabs?|taxis?|flights?|airfares?|hotels?|lodging|fuel|uber|ola|trains?|conveyance|automobiles?|vehicles?)\b/,
  ],
  ["me", /\b(meals?|food|entertainment|dining|restaurants?|snacks?|refreshments?|coffee)\b/],
  ["of", /\b(office|supplies|stationery|equipment|furniture|printing|notebooks?|headphones?|headsets?)\b/],
  ["mk", /\b(marketing|advertis\w*|ads?|promotions?|branding|campaigns?)\b/],
];

/** Maps a category name to its colour family by keyword; unknown names are neutral. */
export function categoryTone(name?: string | null): CategoryTone {
  const n = (name ?? "").toLowerCase();
  if (!n) return "neutral";
  return KEYWORDS.find(([, re]) => re.test(n))?.[0] ?? "neutral";
}

const SIZES = {
  sm: { box: "h-[26px] w-[26px] rounded-[7px]", icon: 15 },
  md: { box: "h-7 w-7 rounded-[7px]", icon: 16 },
  lg: { box: "h-8 w-8 rounded-lg", icon: 18 },
  xl: { box: "h-9 w-9 rounded-[9px]", icon: 20 },
} as const;

interface CategoryGlyphProps {
  /** Category name; mapped with categoryTone(). */
  name?: string | null;
  /** Force a tone instead of matching the name. */
  tone?: CategoryTone;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Decorative category chip: lucide icon on the category's soft colour. */
export default function CategoryGlyph({ name, tone, size = "md", className }: CategoryGlyphProps) {
  const style = CATEGORY_STYLES[tone ?? categoryTone(name)];
  const s = SIZES[size];
  const Icon = style.icon;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center", s.box, style.bg, style.fg, className)}
    >
      <Icon size={s.icon} strokeWidth={1.6} />
    </span>
  );
}

/** 6px dot in the category colour (sub-lines in ledger rows). */
export function CategoryDot({ name, tone, className }: Omit<CategoryGlyphProps, "size">) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", CATEGORY_STYLES[tone ?? categoryTone(name)].fill, className)}
    />
  );
}
