import { useId, type ReactNode } from "react";

/**
 * A captioned group of asset fields, ruled from the group above it (the first
 * group in its parent has no rule). Put the fields in a `FieldGrid`.
 */
export default function AssetFieldGroup({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-rule-2 pt-4 first:border-t-0 first:pt-0"
    >
      <h3 id={headingId} className="cap text-ink-3">
        {title}
      </h3>
      {children}
    </div>
  );
}
