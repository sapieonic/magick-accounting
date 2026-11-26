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
import { travelTypeLabel, type TravelType } from "@/lib/trip";
import { GLYPH_SIZES, ICON_STROKE, glyphTileClass, type GlyphSize } from "@/components/ui/styles";

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

export function TravelTypeIcon({
  type,
  className,
  size,
}: {
  type: TravelType | null | undefined;
  className?: string;
  /** Icon size in px; without it the icon is 16px (`h-4 w-4`). */
  size?: number;
}) {
  const Icon = type ? TRAVEL_TYPE_ICONS[type] : Receipt;
  return (
    <Icon
      className={className ?? (size ? undefined : "h-4 w-4")}
      size={size}
      aria-hidden="true"
      strokeWidth={ICON_STROKE}
    />
  );
}

/** Travel type chip, the trip counterpart of `CategoryGlyph`. Decorative. */
export function TravelGlyph({
  type,
  size = "md",
  className,
}: {
  type: TravelType | null | undefined;
  size?: GlyphSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      title={travelTypeLabel(type)}
      className={cn(glyphTileClass(size, !type || type === "other"), className)}
    >
      <TravelTypeIcon type={type} size={GLYPH_SIZES[size].icon} />
    </span>
  );
}
