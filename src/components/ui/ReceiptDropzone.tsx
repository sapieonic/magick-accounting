"use client";

import { useEffect, useState, ReactNode } from "react";
import { Upload } from "lucide-react";
import clsx from "clsx";

export const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

interface ReceiptDropzoneProps {
  onFile: (file: File) => void;
  /** Also accept files pasted anywhere on the page (e.g. screenshots). */
  acceptPaste?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
}

/**
 * Click-to-browse upload area that also accepts drag-and-drop and (optionally)
 * clipboard-pasted files. Renders default hint text unless children are given.
 */
export default function ReceiptDropzone({
  onFile,
  acceptPaste = false,
  disabled = false,
  children,
  className,
}: ReceiptDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!acceptPaste || disabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? [])[0];
      if (file) {
        e.preventDefault();
        onFile(file);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [acceptPaste, disabled, onFile]);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (file) onFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <label
      data-testid="receipt-dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={clsx(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-colors",
        dragging
          ? "border-brand-400 bg-brand-50/60 dark:border-brand-500/60 dark:bg-brand-500/15"
          : "border-line hover:border-brand-300 hover:bg-brand-50/30 dark:hover:bg-brand-500/10",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      {children ?? (
        <>
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {dragging ? "Drop your receipt here" : "Click, drag & drop, or paste a receipt"}
          </span>
          <span className="text-xs text-muted-foreground">JPEG, PNG, WebP, or PDF up to 10MB</span>
        </>
      )}
      <input
        type="file"
        accept={RECEIPT_ACCEPT}
        onChange={handleSelect}
        className="hidden"
        disabled={disabled}
        aria-label="Upload receipt"
      />
    </label>
  );
}
