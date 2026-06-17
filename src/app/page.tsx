"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTitle } from "@/hooks/useTitle";
import Spinner from "@/components/ui/Spinner";
import { LogIn, Receipt, Shield, Building2 } from "lucide-react";

export default function LoginPage() {
  const { user, loading, error, signInWithGoogle } = useAuth();
  const router = useRouter();
  useTitle("Sign In");

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

  const features = [
    { icon: Receipt, title: "Track Expenses", desc: "Log and organize all your business expenses" },
    { icon: Building2, title: "Departments", desc: "Organize spending by department" },
    { icon: Shield, title: "Secure Access", desc: "Domain-restricted authentication" },
  ];

  return (
    <div className="flex min-h-dvh bg-background selection:bg-brand-500/30">
      {/* Left panel — branding */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-brand-950 p-16 text-white lg:flex">
        {/* Subtle background patterns */}
        <div className="absolute inset-0 z-0 opacity-20">
          <div className="absolute -left-1/4 -top-1/4 h-full w-full rounded-full bg-brand-500 blur-[120px]" />
          <div className="absolute -bottom-1/4 -right-1/4 h-full w-full rounded-full bg-indigo-500 blur-[120px]" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl font-bold backdrop-blur-md">
              M
            </div>
            <span className="font-heading text-2xl font-bold tracking-tight">Magick Accounting</span>
          </div>
        </div>

        <div className="relative z-10 space-y-12">
          <h1 className="font-heading text-5xl font-extrabold leading-[1.1] tracking-tight">
            Sophisticated
            <br />
            expense control
            <br />
            for elite teams.
          </h1>
          <div className="space-y-6">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="mt-1 rounded-xl bg-white/10 p-2.5 backdrop-blur-sm">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-heading text-lg font-bold">{f.title}</p>
                  <p className="mt-0.5 text-sm font-medium text-white/60">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs font-bold uppercase tracking-[0.2em] text-white/40">
          Powered by Magick Voice
        </p>
      </div>

      {/* Right panel — login */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-12 lg:hidden">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white shadow-soft shadow-brand-500/40">
                M
              </div>
              <span className="font-heading text-2xl font-bold tracking-tight text-foreground">
                Magick Accounting
              </span>
            </div>
          </div>

          <div className="mb-10">
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              Sign in with your organization account to continue.
            </p>
          </div>

          {error && (
            <div className="mb-8 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            className="group flex w-full cursor-pointer items-center justify-center gap-4 rounded-2xl border border-line-strong bg-surface px-6 py-4 text-sm font-bold text-foreground shadow-soft transition-all duration-300 hover:bg-subtle hover:shadow-elevated active:scale-[0.98]"
          >
            <svg className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24">
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
            Continue with Google
          </button>

          <div className="mt-10 flex items-center justify-center gap-3">
            <div className="h-px flex-1 bg-line/50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/50">
              Security First
            </span>
            <div className="h-px flex-1 bg-line/50" />
          </div>

          <p className="mt-8 text-center text-xs font-medium leading-relaxed text-muted-foreground/60">
            Authorized organization email domains only.
            <br />
            Access is logged and monitored.
          </p>
        </div>
      </div>
    </div>
  );
}
