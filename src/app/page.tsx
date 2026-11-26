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
import Money, { withPaise } from "@/components/ui/Money";

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

/** Google "G" mark in its brand colours (non-token colours, like the receipt paper below). */
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

/** The bill's items: 6,245.00 before 5% GST (312.25), 6,557.25 in all. */
const RECEIPT_LINES: [string, string][] = [
  ["Veg platter × 2", "1,180.00"],
  ["Paneer tikka × 3", "1,410.00"],
  ["Dal makhani × 2", "980.00"],
  ["Butter naan × 8", "640.00"],
  ["Lime soda × 9", "1,035.00"],
  ["Brownie × 4", "1,000.00"],
];

/**
 * The sign-in panel's one rendered object: a printed bill on thermal paper and,
 * beside it, the expense auto-fill reads from it. Plausible data, decorative.
 * The paper is a fixed off-white in both themes, like the real thing.
 */
function ReceiptMoment() {
  return (
    <div aria-hidden="true" className="relative flex items-start gap-4 pl-1">
      {/* The shadow is a drop-shadow on a wrapper: on the paper itself the zigzag mask would clip it. */}
      <div className="shrink-0 -rotate-2 [filter:drop-shadow(0_18px_20px_rgb(0_0_0/0.45))]">
        <div
          className="w-[228px] bg-[#F6F3EC] px-5 pb-7 pt-5 font-mono text-[11px] leading-[18px] text-[#2A2723]"
          style={{
            WebkitMaskImage:
              "linear-gradient(#000,#000), conic-gradient(from -45deg at 50% 100%, #000 90deg, transparent 0)",
            WebkitMaskSize: "100% calc(100% - 6px), 12px 6px",
            WebkitMaskPosition: "top, bottom",
            WebkitMaskRepeat: "no-repeat, repeat-x",
          }}
        >
          <p className="text-center text-[12px] font-medium tracking-[0.04em]">SAFFRON TABLE</p>
          <p className="text-center text-[#6E685E]">14 Lantern Lane, Bengaluru</p>
          <p className="mt-1 text-center text-[#6E685E]">GSTIN 29ABCDE1234F1Z5</p>
          <p className="mt-3 border-t border-dashed border-[#B9B2A5] pt-2 text-[#6E685E]">21 Nov 2026 · 13:42 · T14</p>
          <div className="mt-2 flex flex-col">
            {RECEIPT_LINES.map(([item, amount]) => (
              <p key={item} className="flex justify-between gap-3">
                <span className="truncate">{item}</span>
                <span className="tabular-nums">{amount}</span>
              </p>
            ))}
          </div>
          <p className="mt-2 flex justify-between border-t border-dashed border-[#B9B2A5] pt-2 text-[#6E685E]">
            <span>CGST + SGST 5%</span>
            <span className="tabular-nums">312.25</span>
          </p>
          <p className="mt-1 flex justify-between text-[13px] font-medium">
            <span>Total</span>
            <span className="tabular-nums">₹6,557.25</span>
          </p>
        </div>
      </div>

      <div className="mt-10 flex min-w-0 flex-1 flex-col gap-3 rounded-panel border border-rule bg-surface p-4 shadow-[0_16px_40px_-16px_rgb(0_0_0/0.7)]">
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <ScanText size={14} strokeWidth={ICON_STROKE} />
          Read from the bill
        </p>
        <div className="flex flex-col gap-0.5">
          <p className="ell text-sm font-medium text-ink">Team lunch, Saffron Table</p>
          <p className="figure text-[24px] font-medium text-ink">{withPaise("₹6,557.25")}</p>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-rule-2 pt-3 text-xs">
          <dt className="text-ink-3">Category</dt>
          <dd className="ell text-ink-2">Meals</dd>
          <dt className="text-ink-3">GST</dt>
          <dd className="text-ink-2">
            <Money value="₹312.25" />
          </dd>
          <dt className="text-ink-3">Paid by</dt>
          <dd className="ell text-amber">Neha, from pocket</dd>
        </dl>
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
      {/* Brand panel (desktop only): graphite in both themes, with one rendered
          moment, a bill and the expense it becomes. */}
      <aside className="dark hidden w-[min(48%,640px)] shrink-0 flex-col justify-between gap-10 overflow-hidden bg-background p-[clamp(32px,4vw,56px)] text-ink lg:flex">
        <BrandLogo size="lg" />

        <div className="flex flex-col gap-10">
          <p className="max-w-[16ch] text-[clamp(32px,3.2vw,44px)] font-medium leading-[1.08] tracking-[-0.025em] text-ink [text-wrap:balance]">
            Every rupee, accounted for.
          </p>
          <ReceiptMoment />
        </div>

        <ul className="flex flex-col">
          {FACTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3 border-t border-rule py-3 last:border-b">
              <Icon aria-hidden="true" size={18} strokeWidth={ICON_STROKE} className="mt-0.5 shrink-0 text-ink-3" />
              <p className="min-w-0 text-sm text-ink-3">
                <span className="font-medium text-ink">{title}.</span> {text}
              </p>
            </li>
          ))}
        </ul>
      </aside>

      {/* Sign-in */}
      <main className="flex min-w-0 flex-1 flex-col px-[var(--pad)] py-10">
        <BrandLogo className="lg:hidden" />
        <div className="my-auto flex w-full max-w-[360px] flex-col gap-6 self-center py-10">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] font-medium leading-tight tracking-[-0.02em] text-ink">Sign in</h1>
            <p className="text-sm text-ink-3">Use your organization&apos;s Google account to continue.</p>
          </div>

          {error && <SignInError message={error} />}

          <Button variant="secondary" fullWidth onClick={signInWithGoogle}>
            <GoogleMark />
            Continue with Google
          </Button>

          <p className="border-t border-rule pt-4 text-[13px] leading-5 text-ink-3">
            Only approved organization email domains can sign in. New here? Your account is created the first time you
            sign in.
          </p>
        </div>
      </main>
    </div>
  );
}
