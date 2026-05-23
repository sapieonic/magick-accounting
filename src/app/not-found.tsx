import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold tracking-wide text-brand-500">404</p>
      <h1 className="mt-2 text-2xl font-bold text-foreground">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link href="/dashboard" className="btn-primary mt-6">
        Back to Dashboard
      </Link>
    </div>
  );
}
