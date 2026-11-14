import {
  BedDouble,
  Bus,
  CarTaxiFront,
  Ellipsis,
  Handshake,
  Plane,
  Receipt,
  Stamp,
  TrainFront,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui/cn";
import { CATEGORY_STYLES, type CategoryTone } from "@/components/ui/CategoryGlyph";
import { travelTypeLabel, type TravelType } from "@/lib/trip";

const TRAVEL_TYPE_ICONS: Record<TravelType, LucideIcon> = {
  flight: Plane,
  train: TrainFront,
  bus: Bus,
  cab: CarTaxiFront,
  stay: BedDouble,
  food: UtensilsCrossed,
  client_meeting: Handshake,
  visa: Stamp,
  other: Ellipsis,
};

/** Travel types borrow the muted category colours: transport blue, stay violet, food amber... */
const TRAVEL_TYPE_TONES: Record<TravelType | "none", CategoryTone> = {
  flight: "tr",
  train: "tr",
  bus: "tr",
  cab: "co",
  stay: "ed",
  food: "me",
  client_meeting: "mk",
  visa: "of",
  other: "neutral",
  none: "neutral",
};

/** Soft chip classes (background + glyph colour) per type. */
const TRAVEL_TYPE_CHIP_CLASSES = Object.fromEntries(
  Object.entries(TRAVEL_TYPE_TONES).map(([type, tone]) => [type, `${CATEGORY_STYLES[tone].bg} ${CATEGORY_STYLES[tone].fg}`])
) as Record<TravelType | "none", string>;

export function TravelTypeIcon({
  type,
  className = "h-4 w-4",
}: {
  type: TravelType | null | undefined;
  className?: string;
}) {
  const Icon = type ? TRAVEL_TYPE_ICONS[type] : Receipt;
  return <Icon className={className} aria-hidden="true" strokeWidth={1.6} />;
}

const SIZES = {
  sm: "h-[26px] w-[26px] rounded-[7px] [&_svg]:h-[15px] [&_svg]:w-[15px]",
  md: "h-7 w-7 rounded-[7px] [&_svg]:h-4 [&_svg]:w-4",
} as const;

/** Travel type chip, the trip counterpart of `CategoryGlyph`. Decorative. */
export function TravelGlyph({
  type,
  size = "md",
  className,
}: {
  type: TravelType | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      title={travelTypeLabel(type)}
      className={cn("inline-flex shrink-0 items-center justify-center", SIZES[size], TRAVEL_TYPE_CHIP_CLASSES[type ?? "none"], className)}
    >
      <TravelTypeIcon type={type} />
    </span>
  );
}
