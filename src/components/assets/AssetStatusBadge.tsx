import Badge, { type Tone } from "@/components/ui/Badge";

/** Asset lifecycle statuses in display order, with their labels and badge tones. */
export const ASSET_STATUSES: { value: string; label: string; tone: Tone }[] = [
  { value: "active", label: "Active", tone: "success" },
  { value: "under_repair", label: "Under repair", tone: "amber" },
  { value: "retired", label: "Retired", tone: "neutral" },
  { value: "sold", label: "Sold", tone: "accent" },
  { value: "lost", label: "Lost", tone: "danger" },
  { value: "disposed", label: "Disposed", tone: "neutral" },
];

/** Statuses that end an asset's life; they cannot be changed afterwards. */
export const TERMINAL_STATUSES = new Set(["retired", "sold", "lost", "disposed"]);

export function assetStatusLabel(status: string): string {
  return ASSET_STATUSES.find((s) => s.value === status)?.label ?? status.replaceAll("_", " ");
}

export default function AssetStatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = ASSET_STATUSES.find((s) => s.value === status)?.tone ?? "neutral";
  return (
    <Badge tone={tone} dot className={className}>
      {assetStatusLabel(status)}
    </Badge>
  );
}
