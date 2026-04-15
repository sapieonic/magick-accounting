"use client";

import clsx from "clsx";

export default function Spinner({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: {
      shell: "h-4 w-4",
      ring: "border",
      core: "h-1.5 w-1.5",
      dot: "h-1.5 w-1.5",
    },
    md: {
      shell: "h-6 w-6",
      ring: "border-[1.5px]",
      core: "h-2 w-2",
      dot: "h-2 w-2",
    },
    lg: {
      shell: "h-12 w-12",
      ring: "border-2",
      core: "h-3 w-3",
      dot: "h-2.5 w-2.5",
    },
  };

  const sizeConfig = sizeClasses[size];

  return (
    <div
      className={clsx("relative inline-flex items-center justify-center", sizeConfig.shell, className)}
      role="status"
      aria-label="Loading"
    >
      <span className={clsx("absolute inset-0 rounded-full border-brand-100/80 animate-loader-pulse", sizeConfig.ring)} />
      <span className={clsx("absolute inset-[18%] rounded-full border border-brand-200/70", sizeConfig.ring)} />
      <span className="absolute inset-0 animate-loader-orbit">
        <span
          className={clsx(
            "absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-500 to-cyan-400 shadow-[0_0_14px_rgba(37,99,235,0.35)]",
            sizeConfig.dot
          )}
        />
      </span>
      <span
        className={clsx(
          "relative rounded-full bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-400 shadow-[0_0_18px_rgba(37,99,235,0.2)] animate-loader-breathe",
          sizeConfig.core
        )}
      />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="relative flex min-h-[16rem] flex-col items-center justify-center overflow-hidden rounded-2xl border border-brand-100/70 bg-gradient-to-b from-white via-brand-50/40 to-cyan-50/60 px-6 py-10 text-center">
      <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-200/20 blur-3xl" />
      <div className="relative flex flex-col items-center gap-4">
        <div className="rounded-full bg-white/80 p-4 shadow-lg shadow-brand-100/50 ring-1 ring-brand-100/80 backdrop-blur">
          <Spinner size="lg" />
        </div>
        <p className="text-sm font-medium text-gray-700">Loading data...</p>
        <p className="text-xs text-gray-400">Serverless APIs can take a few seconds to warm up.</p>
      </div>
    </div>
  );
}

export function InlineLoader({
  label = "Loading...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={clsx("inline-flex items-center gap-2 text-sm text-gray-500", className)}>
      <Spinner size="sm" />
      <span>{label}</span>
    </div>
  );
}
