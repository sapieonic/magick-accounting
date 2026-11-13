import { ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import BrandLogo from "@/components/layout/BrandLogo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-[var(--pad)] py-8">
      <BrandLogo />
      <div className="my-auto flex w-full max-w-[420px] flex-col items-start gap-3 self-center py-12">
        <p className="num text-sm font-medium text-accent">404</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">Page not found</h1>
        <p className="text-sm text-ink-3">The page you&apos;re looking for doesn&apos;t exist or may have been moved.</p>
        <Button href="/dashboard" icon={ArrowLeft} className="mt-3">
          Back to Dashboard
        </Button>
      </div>
    </main>
  );
}
