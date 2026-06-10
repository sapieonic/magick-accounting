"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import clsx from "clsx";

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
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
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
    },
    [removeToast]
  );

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    error: <AlertCircle className="h-5 w-5 text-red-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "animate-slide-up flex items-center gap-3 rounded-lg border bg-surface-elevated px-4 py-3 shadow-lg dark:shadow-black/40",
              t.type === "success" && "border-emerald-200 dark:border-emerald-500/30",
              t.type === "error" && "border-red-200 dark:border-red-500/30",
              t.type === "info" && "border-blue-200 dark:border-blue-500/30"
            )}
          >
            {icons[t.type]}
            <p className="text-sm text-foreground">{t.message}</p>
            {t.action && (
              <button
                onClick={() => {
                  t.action?.onClick();
                  removeToast(t.id);
                }}
                className="ml-1 cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => removeToast(t.id)}
              className="ml-2 rounded p-1 text-muted-foreground transition-colors hover:bg-subtle hover:text-muted"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
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
