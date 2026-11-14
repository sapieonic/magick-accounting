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
    <span
      aria-hidden="true"
      className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-sunk text-ink-2", className)}
    >
      <Icon size={16} strokeWidth={1.6} />
    </span>
  );
}
