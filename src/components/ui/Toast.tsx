"use client";

import { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { linkClass, ICON_STROKE } from "@/components/ui/styles";
import { cn } from "@/components/ui/cn";

type ToastType = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  action?: ToastAction;
  durationMs?: number;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextType {
  /** Shows a toast; returns its id, for `dismiss`. */
  toast: (message: string, type?: ToastType, options?: ToastOptions) => string;
  /** Closes a toast early, e.g. an Undo that no longer applies. */
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEFAULT_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "success", options?: ToastOptions) => {
      const id = `${Date.now()}-${counter.current++}`;
      setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);
      setTimeout(() => removeToast(id), options?.durationMs ?? DEFAULT_DURATION_MS);
      return id;
    },
    [removeToast]
  );

  const value = useMemo(() => ({ toast, dismiss: removeToast }), [toast, removeToast]);

  const icons = {
    success: <CheckCircle2 aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="shrink-0 text-success" />,
    error: <AlertCircle aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="shrink-0 text-danger" />,
    info: <Info aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="shrink-0 text-ink-3" />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Bottom-right, 12px above the mobile tab bar (--tabbar-h) and a mounted
          FormFooter (its measured --form-footer-h, which grows when it wraps),
          so a toast never covers Save or the total. Pages without a FormFooter
          end --toast-room above the tab bar (dashboard layout), so it doesn't
          cover their last control either. */}
      <div
        className="fixed inset-x-4 bottom-[calc(var(--tabbar-h)+var(--form-footer-h,0px)+12px)] z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5"
        aria-live="polite"
        data-testid="toast-region"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-slide-up flex w-full max-w-sm items-center gap-3 rounded-panel border border-rule bg-surface py-1.5 pl-4 pr-1.5 shadow-elevated",
              "border-l-[3px]",
              { success: "border-l-success", error: "border-l-danger", info: "border-l-accent" }[t.type]
            )}
          >
            {icons[t.type]}
            <p className="flex-1 py-1.5 text-sm text-ink">{t.message}</p>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  removeToast(t.id);
                }}
                className={cn(linkClass, "min-h-10 cursor-pointer px-2 text-sm")}
              >
                {t.action.label}
              </button>
            )}
            <IconButton icon={X} size="sm" onClick={() => removeToast(t.id)} aria-label="Dismiss notification" />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
