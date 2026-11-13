"use client";

import { useEffect, useState, ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/components/ui/cn";

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
      className={cn(
        "relative flex cursor-pointer flex-col items-center gap-1 rounded-panel border-[1.5px] border-dashed px-4 py-6 text-center",
        "transition-[background-color,border-color] duration-150",
        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        dragging ? "border-accent bg-tint-2" : "border-accent-line bg-tint hover:border-accent hover:bg-tint-2",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      {children ?? (
        <>
          <Upload aria-hidden="true" size={22} strokeWidth={1.5} className="mb-1 text-accent" />
          <span className="text-sm font-medium text-ink">
            {dragging ? "Drop your receipt here" : "Click, drag & drop, or paste a receipt"}
          </span>
          <span className="text-xs text-ink-3">JPEG, PNG, WebP, or PDF up to 10MB</span>
        </>
      )}
      <input
        type="file"
        accept={RECEIPT_ACCEPT}
        onChange={handleSelect}
        className="sr-only"
        disabled={disabled}
        aria-label="Upload receipt"
      />
    </label>
  );
}
