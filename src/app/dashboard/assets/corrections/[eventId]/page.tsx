"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarClock, MessageSquareText, Package, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import Panel, { PanelGrid } from "@/components/ui/Panel";
import { FormSkeleton } from "@/components/ui/Skeleton";
import DetailList, { type DetailItem } from "@/components/assets/DetailList";

interface Correction {
  assetTag: string;
  reason: string;
  occurredAt: string;
  actor?: { name: string; email: string };
  snapshot?: Record<string, unknown>;
}

export default function AssetCorrectionPage() {
  useTitle("Asset Correction");
  const params = useParams();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [correction, setCorrection] = useState<Correction | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/dashboard/assets");
      return;
    }
    api.get(`/api/assets/corrections/${params.eventId}`)
      .then((data) => setCorrection(data.correction))
      .catch((err) => {
        toast(err instanceof Error ? err.message : "Failed to load correction", "error");
        router.replace("/dashboard/assets");
      });
  }, [isAdmin, params.eventId, router, toast]);

  if (!correction) return <FormSkeleton />;

  const title = `Reversal ${correction.assetTag}`;
  const snapshotAsset = correction.snapshot?.asset as { name?: unknown } | null | undefined;
  const assetName = typeof snapshotAsset?.name === "string" ? snapshotAsset.name : null;
  const details: DetailItem[] = [
    ...(assetName ? [{ label: "Asset", icon: Package, value: assetName }] : []),
    { label: "Reason", icon: MessageSquareText, value: correction.reason },
    {
      label: "Recorded",
      icon: CalendarClock,
      value: <span className="num">{format(new Date(correction.occurredAt), "dd MMM yyyy, HH:mm")}</span>,
    },
    { label: "Recorded by", icon: UserRound, value: correction.actor?.name || "Administrator" },
  ];

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Assets", href: "/dashboard/assets" }, { label: title }]}
        title={title}
        meta="Permanent correction audit record"
        actions={<Badge tone="danger" dot>Reversed</Badge>}
      />
      <PanelGrid min={360}>
        <Panel title="Correction" wash>
          <DetailList items={details} />
        </Panel>
        <Panel
          grow={2}
          title="Retained record snapshot"
          meta="The asset, linked purchase and assignment history as they existed at reversal."
        >
          <pre className="max-h-[65vh] overflow-auto rounded-control border border-rule bg-sunk p-4 font-mono text-xs leading-relaxed text-ink-2">
            {JSON.stringify(correction.snapshot || {}, null, 2)}
          </pre>
        </Panel>
      </PanelGrid>
    </div>
  );
}
