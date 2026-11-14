import { ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import BrandLogo from "@/components/layout/BrandLogo";
import StatusPage from "@/components/layout/StatusPage";

export default function NotFound() {
  return (
    <StatusPage
      top={<BrandLogo />}
      eyebrow="404"
      tone="accent"
      title="Page not found"
    >
      <p className="text-sm text-ink-3">The page you&apos;re looking for doesn&apos;t exist or may have been moved.</p>
      <Button href="/dashboard" icon={ArrowLeft} className="mt-3">
        Back to dashboard
      </Button>
    </StatusPage>
  );
}
