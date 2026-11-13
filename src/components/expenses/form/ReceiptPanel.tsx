"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FileImage, FileText, RefreshCw, Sparkles, TriangleAlert, Upload, X as XIcon } from "lucide-react";
import Button, { IconButton } from "@/components/ui/Button";
import ReceiptDropzone from "@/components/ui/ReceiptDropzone";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";
import { ICON_STROKE, linkClass, panelClass } from "@/components/ui/styles";

/** A blob URL for `file` while it is mounted (null where the browser can't make one). */
function useObjectUrl(file: File | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface ReceiptPanelProps {
  /** A file picked in this session: previewed when it's an image. */
  file?: File | null;
  /** Name of the attached receipt (new or stored), or null for none. */
  filename: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
  /** Content of the empty drop zone (defaults to the zone's own hint). */
  emptyPrompt?: ReactNode;
  /** Strip under the receipt, e.g. `ReceiptReadStatus`. */
  status?: ReactNode;
}

/** The receipt column: drop zone, or the attached file with a preview and a zone to replace it. */
export default function ReceiptPanel({
  file,
  filename,
  onFile,
  onRemove,
  disabled = false,
  emptyPrompt,
  status,
}: ReceiptPanelProps) {
  const url = useObjectUrl(file);

  if (!filename) {
    return (
      <ReceiptDropzone onFile={onFile} acceptPaste disabled={disabled} className="py-12">
        {emptyPrompt}
      </ReceiptDropzone>
    );
  }

  const isImage = Boolean(file?.type.startsWith("image/"));
  const isPdf = file?.type === "application/pdf";
  const Icon = isImage ? FileImage : FileText;

  return (
    <>
      <div className={cn(panelClass, "flex flex-col overflow-hidden")}>
        <div className="flex items-center gap-3 py-2 pl-4 pr-2">
          <Icon aria-hidden="true" size={20} strokeWidth={1.5} className="shrink-0 text-accent" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="ell text-sm font-medium text-ink" title={filename}>
              {filename}
            </span>
            <span className="text-xs text-ink-3">
              {file ? `${isPdf ? "PDF" : isImage ? "Image" : "File"} · ${formatSize(file.size)}` : "Attached receipt"}
            </span>
          </div>
          <IconButton icon={XIcon} aria-label="Remove receipt" onClick={onRemove} disabled={disabled} />
        </div>

        {url && isImage && (
          <div className="flex justify-center border-t border-rule-2 bg-sunk p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img
              src={url}
              alt="Receipt preview"
              className="max-h-[min(45vh,480px)] max-w-full rounded-[4px] border border-rule bg-surface object-contain"
            />
          </div>
        )}
        {url && isPdf && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule-2 bg-sunk px-4 py-3 text-[13px] text-ink-2">
            <span>PDF receipt</span>
            <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Open preview<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        )}
        {status}
      </div>

      <ReceiptDropzone onFile={onFile} disabled={disabled} className="py-4">
        <Upload aria-hidden="true" size={18} strokeWidth={1.5} className="text-accent" />
        <span className="text-sm font-medium text-ink">Drop another photo or PDF to replace it</span>
        <span className="text-xs text-ink-3">or choose a file · JPEG, PNG, WebP or PDF up to 10MB</span>
      </ReceiptDropzone>
    </>
  );
}

interface ReceiptReadStatusProps {
  state: "reading" | "done" | "failed";
  /** Fields filled in, for "done". */
  count?: number;
  onRetry?: () => void;
}

/** AI auto-fill progress/result strip at the foot of the receipt card. */
export function ReceiptReadStatus({ state, count = 0, onRetry }: ReceiptReadStatusProps) {
  const retry = onRetry && state !== "reading" && (
    <Button variant="ghost" size="sm" icon={RefreshCw} onClick={onRetry} className="text-accent">
      {state === "failed" ? "Try again" : "Read again"}
    </Button>
  );
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule-2 py-1.5 pl-4 pr-2 text-[13px]",
        state === "failed" ? "bg-amber-soft" : "bg-accent-soft"
      )}
    >
      {state === "reading" ? (
        <Spinner size="sm" />
      ) : state === "failed" ? (
        <TriangleAlert aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="shrink-0 text-amber" />
      ) : (
        <Sparkles aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="shrink-0 text-accent" />
      )}
      <p className="min-w-0 flex-1 basis-[180px] [text-wrap:pretty]">
        {state === "reading" ? (
          <>
            <span className="font-medium text-ink">Reading your receipt…</span>{" "}
            <span className="text-ink-2">This usually takes a few seconds.</span>
          </>
        ) : state === "failed" ? (
          <>
            <span className="font-medium text-ink">Couldn&apos;t read this receipt.</span>{" "}
            <span className="text-ink-2">Fill in the details yourself.</span>
          </>
        ) : count > 0 ? (
          <>
            <span className="font-medium text-ink">
              Auto-fill read {count} field{count === 1 ? "" : "s"}.
            </span>{" "}
            <span className="text-ink-2">Check each one marked “from receipt”.</span>
          </>
        ) : (
          <span className="text-ink-2">Auto-fill found nothing to fill in.</span>
        )}
      </p>
      {retry}
    </div>
  );
}
