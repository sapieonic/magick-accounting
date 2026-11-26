import {
  Armchair,
  Car,
  Factory,
  Laptop,
  Package,
  Printer,
  Smartphone,
  Speaker,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { GLYPH_SIZES, ICON_STROKE, glyphTileClass } from "@/components/ui/styles";

// First match wins; mirrors the asset categories offered when recording a purchase.
const KEYWORDS: [LucideIcon, RegExp][] = [
  [Laptop, /computer|laptop|desktop|monitor|server/],
  [Smartphone, /mobile|phone|tablet/],
  [Speaker, /audio|video|camera|projector|speaker/],
  [Armchair, /furniture|fixture|chair|desk/],
  [Car, /vehicle|car\b|bike|scooter/],
  [Factory, /plant|machinery|machine/],
  [Printer, /office|equipment|printer/],
];

/** Decorative asset-type chip: a neutral glyph picked from the asset category. */
export default function AssetGlyph({ category, className }: { category?: string | null; className?: string }) {
  const name = (category ?? "").toLowerCase();
  const Icon = KEYWORDS.find(([, re]) => re.test(name))?.[0] ?? Package;
  return (
    <span aria-hidden="true" className={cn(glyphTileClass("md"), className)}>
      <Icon size={GLYPH_SIZES.md.icon} strokeWidth={ICON_STROKE} />
    </span>
  );
}
