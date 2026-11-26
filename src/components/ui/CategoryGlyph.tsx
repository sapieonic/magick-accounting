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
import { GLYPH_SIZES, ICON_STROKE, glyphTileClass, type GlyphSize } from "@/components/ui/styles";

export type CategoryTone = "sw" | "co" | "tr" | "ed" | "me" | "of" | "mk" | "neutral";

/** The icon per category family; every family shares the neutral glyph tile. */
export const CATEGORY_ICONS: Record<CategoryTone, LucideIcon> = {
  sw: AppWindow,
  co: MessageSquare,
  tr: MapPin,
  ed: GraduationCap,
  me: Coffee,
  of: PenLine,
  mk: Megaphone,
  neutral: Tag,
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

/** Maps a category name to its icon family by keyword; unknown names are neutral. */
export function categoryTone(name?: string | null): CategoryTone {
  const n = (name ?? "").toLowerCase();
  if (!n) return "neutral";
  return KEYWORDS.find(([, re]) => re.test(n))?.[0] ?? "neutral";
}

interface CategoryGlyphProps {
  /** Category name; mapped with categoryTone(). */
  name?: string | null;
  /** Force a tone instead of matching the name. */
  tone?: CategoryTone;
  size?: GlyphSize;
  className?: string;
}

/** Decorative category chip: the category's lucide icon on a quiet neutral tile (the icon tells them apart, not colour). */
export default function CategoryGlyph({ name, tone, size = "md", className }: CategoryGlyphProps) {
  const family = tone ?? categoryTone(name);
  const Icon = CATEGORY_ICONS[family];
  return (
    <span aria-hidden="true" className={cn(glyphTileClass(size, family === "neutral"), className)}>
      <Icon size={GLYPH_SIZES[size].icon} strokeWidth={ICON_STROKE} />
    </span>
  );
}
