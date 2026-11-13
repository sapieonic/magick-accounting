"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, ScanText, Send, Wallet, type LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import { ICON_STROKE } from "@/components/ui/styles";
import BrandLogo from "@/components/layout/BrandLogo";

const FACTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ScanText,
    title: "Receipts read for you",
    text: "Upload a photo or PDF and auto-fill drafts the amount, date and category.",
  },
  {
    icon: Wallet,
    title: "Company or pocket",
    text: "Every expense records who paid, so what is owed back is never a guess.",
  },
  {
    icon: Send,
    title: "Telegram on the go",
    text: "Send a receipt to the bot from your phone and save it as an expense.",
  },
];

/** Google "G" mark in its brand colours (the only non-token colours on the page). */
function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

/** Sign-in error; a blocked email domain gets its own explanation. */
function SignInError({ message }: { message: string }) {
  const blocked = /not allowed/i.test(message);
  return (
    <div role="alert" className="flex gap-3 rounded-panel border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
      <CircleAlert aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="mt-px shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="font-medium text-danger">{blocked ? "This email can't sign in here" : "Couldn't sign you in"}</p>
        <p className="mt-0.5 break-words text-ink-2">{message}</p>
        {blocked && (
          <p className="mt-1 text-ink-2">Use your work Google account, or ask an admin to allow your domain.</p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { user, loading, error, signInWithGoogle } = useAuth();
  const router = useRouter();
  useTitle("Sign in");

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (user) return null;

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Brand panel, in the rail's indigo (desktop only). */}
      <aside className="hidden w-[min(46%,620px)] shrink-0 flex-col justify-between gap-12 bg-rail p-[clamp(32px,4vw,56px)] text-rail-ink lg:flex">
        <BrandLogo size="lg" variant="onDark" />

        <div className="flex flex-col gap-10">
          <p className="text-[clamp(30px,3vw,42px)] font-semibold leading-[1.1] tracking-[-0.03em] text-white [text-wrap:balance]">
            Every rupee, accounted for.
          </p>
          <ul className="flex flex-col">
            {FACTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 border-t border-rail-line py-4 last:border-b">
                <Icon aria-hidden="true" size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-rail-icon" />
                <div className="min-w-0">
                  <p className="font-medium text-white">{title}</p>
                  <p className="mt-0.5 text-sm text-rail-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-rail-muted">One workspace for your organization&apos;s expenses, trips and GST invoices.</p>
      </aside>

      {/* Sign-in */}
      <main className="flex min-w-0 flex-1 flex-col px-[var(--pad)] py-10">
        <BrandLogo className="lg:hidden" />
        <div className="my-auto flex w-full max-w-[360px] flex-col gap-6 self-center py-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-ink">Sign in</h1>
            <p className="text-sm text-ink-3">Use your organization&apos;s Google account to continue.</p>
          </div>

          {error && <SignInError message={error} />}

          <Button variant="secondary" fullWidth onClick={signInWithGoogle}>
            <GoogleMark />
            Continue with Google
          </Button>

          <p className="border-t border-rule pt-4 text-[13px] text-ink-3">
            Only approved organization email domains can sign in. New here? Your account is created the first time you
            sign in.
          </p>
        </div>
      </main>
    </div>
  );
}
