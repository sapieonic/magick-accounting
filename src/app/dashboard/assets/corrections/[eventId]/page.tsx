"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, History } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import { useToast } from "@/components/ui/Toast";
import { FormSkeleton } from "@/components/ui/Skeleton";

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

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <Link href="/dashboard/assets" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Assets
        </Link>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-red-100 p-3 text-red-600 dark:bg-red-500/15 dark:text-red-300"><History className="h-6 w-6" /></div>
          <div><h1 className="text-2xl font-bold text-foreground">Reversal {correction.assetTag}</h1><p className="mt-1 text-sm text-muted-foreground">Permanent correction audit record</p></div>
        </div>
      </div>
      <div className="card p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Reason</dt><dd className="mt-1 font-medium text-foreground">{correction.reason}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Recorded</dt><dd className="mt-1 font-medium text-foreground">{format(new Date(correction.occurredAt), "dd MMM yyyy, HH:mm")}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Recorded by</dt><dd className="mt-1 font-medium text-foreground">{correction.actor?.name || "Administrator"}</dd></div>
        </dl>
      </div>
      <div className="card p-5">
        <h2 className="font-heading text-base font-bold text-foreground">Retained record snapshot</h2>
        <p className="mt-1 text-xs text-muted-foreground">The asset, linked purchase and assignment history as they existed at reversal.</p>
        <pre className="mt-4 max-h-[65vh] overflow-auto rounded-xl border border-line bg-subtle p-4 text-xs text-muted">{JSON.stringify(correction.snapshot || {}, null, 2)}</pre>
      </div>
    </div>
  );
}
