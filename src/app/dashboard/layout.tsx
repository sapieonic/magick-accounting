"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import MobileTabBar from "@/components/layout/MobileTabBar";
import Spinner from "@/components/ui/Spinner";
import CommandPalette from "@/components/ui/CommandPalette";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <a
        href="#main"
        className="sr-only z-[60] rounded-control bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <CommandPalette />
      <Sidebar open={drawerOpen} onClose={closeDrawer} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        {/* Fluid: no max-width column. The padding lives on an inner wrapper, not
            on the scroller: sticky offsets are measured from the scroller's padding
            edge, so padding on <main> would push sticky footers and side panels off
            their intended positions. Bottom padding clears the mobile tab bar. */}
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto focus:outline-none">
          <div className="px-[var(--pad)] pb-[calc(96px+env(safe-area-inset-bottom))] pt-6 lg:pb-10">
            {children}
          </div>
        </main>
      </div>
      <MobileTabBar onMore={openDrawer} moreOpen={drawerOpen} />
    </div>
  );
}
