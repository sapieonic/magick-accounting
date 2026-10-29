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
import type { TravelType } from "@/lib/trip";

export const TRAVEL_TYPE_ICONS: Record<TravelType, LucideIcon> = {
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

/** Tinted chip classes per type (light + dark), matching the category badge style. */
export const TRAVEL_TYPE_CHIP_CLASSES: Record<TravelType | "none", string> = {
  flight: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  train: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  bus: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  cab: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  stay: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  food: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  client_meeting: "bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300",
  visa: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
  other: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  none: "bg-subtle text-muted-foreground",
};

/** Solid fills for the stacked spend bar and breakdown bars. */
export const TRAVEL_TYPE_BAR_CLASSES: Record<TravelType | "none", string> = {
  flight: "bg-sky-500",
  train: "bg-indigo-500",
  bus: "bg-violet-500",
  cab: "bg-yellow-500",
  stay: "bg-emerald-500",
  food: "bg-orange-500",
  client_meeting: "bg-pink-500",
  visa: "bg-teal-500",
  other: "bg-slate-400",
  none: "bg-slate-300 dark:bg-slate-600",
};

export function TravelTypeIcon({
  type,
  className = "h-4 w-4",
}: {
  type: TravelType | null | undefined;
  className?: string;
}) {
  const Icon = type ? TRAVEL_TYPE_ICONS[type] : Receipt;
  return <Icon className={className} aria-hidden="true" />;
}
