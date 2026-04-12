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
      <div className="flex min-h-dvh items-center justify-center bg-gray-50">
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
    <div className="flex min-h-dvh">
      {/* Left panel — branding */}
      <div className="hidden flex-1 flex-col justify-between bg-brand-600 p-12 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-lg font-bold">
              M
            </div>
            <span className="text-xl font-semibold">Magick Accounting</span>
          </div>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-bold leading-tight">
            Simple expense
            <br />
            management for
            <br />
            your team.
          </h1>
          <div className="space-y-4">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="rounded-lg bg-white/10 p-2">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-white/70">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm text-white/50">Powered by Magick Voice</p>
      </div>

      {/* Right panel — login */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
                M
              </div>
              <span className="text-xl font-semibold text-gray-900">Magick Accounting</span>
            </div>
          </div>

          <h2 className="mb-2 text-2xl font-bold text-gray-900">Welcome back</h2>
          <p className="mb-8 text-gray-500">
            Sign in with your organization&apos;s Google account to continue.
          </p>

          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow-md active:scale-[0.99]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
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

          <p className="mt-6 text-center text-xs text-gray-400">
            Only authorized organization email domains can access this application.
          </p>
        </div>
      </div>
    </div>
  );
}
