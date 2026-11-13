"use client";

import { useEffect, useRef, ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      contentRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B0B12]/45 p-0 sm:items-center sm:p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className={`animate-slide-up flex max-h-[92dvh] w-full flex-col ${maxWidth} rounded-t-panel border border-rule bg-surface shadow-elevated outline-none sm:rounded-panel`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-rule py-2 pl-5 pr-2">
          <h2 className="text-base font-semibold tracking-[-0.015em] text-ink">{title}</h2>
          <IconButton icon={X} size="sm" onClick={onClose} aria-label="Close dialog" />
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
