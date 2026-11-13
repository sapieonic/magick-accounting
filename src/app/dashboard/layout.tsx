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
            their intended positions. Bottom padding clears the mobile tab bar
            (--tabbar-h, 0 from lg up); on phones, pages without a FormFooter get
            extra room so a toast at the end of the page doesn't cover its last
            control (e.g. "Load more"). Scroll padding keeps a focused field clear
            of the tab bar and a sticky FormFooter (WCAG 2.4.11). */}
        <main
          id="main"
          tabIndex={-1}
          className="min-h-0 flex-1 scroll-pb-[calc(var(--tabbar-h)+var(--form-footer-h,0px)+16px)] scroll-pt-6 overflow-y-auto focus:outline-none"
        >
          <div className="px-[var(--pad)] pb-[calc(var(--tabbar-h)+40px)] pt-6 max-lg:[&:not(:has([data-form-footer]))]:pb-[calc(var(--tabbar-h)+88px)]">
            {children}
          </div>
        </main>
      </div>
      <MobileTabBar onMore={openDrawer} moreOpen={drawerOpen} />
    </div>
  );
}
