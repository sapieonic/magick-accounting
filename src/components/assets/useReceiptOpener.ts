"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

/** Opens a purchase receipt through a presigned URL; `opening` is the id being opened. */
export function useReceiptOpener() {
  const { toast } = useToast();
  const [opening, setOpening] = useState<string | null>(null);

  const openReceipt = useCallback(
    async (id: string, receiptKey?: string) => {
      if (!receiptKey) return;
      setOpening(id);
      try {
        const data = await api.get(`/api/upload?key=${encodeURIComponent(receiptKey)}`);
        window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
      } catch {
        toast("Failed to open purchase receipt", "error");
      } finally {
        setOpening(null);
      }
    },
    [toast]
  );

  return { opening, openReceipt };
}
