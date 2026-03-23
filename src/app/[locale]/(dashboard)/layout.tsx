"use client";

import { useState, Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { GroupProvider, useGroup } from "@/lib/group-context";
import { useRouter } from "@/i18n/routing";
import { DashboardSkeleton } from "@/components/ui/page-skeleton";
import { ScrollToTopOnNav } from "@/components/ui/scroll-to-top-on-nav";

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { loading, memberships } = useGroup();
  const router = useRouter();

  // Still loading — show skeleton
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold animate-pulse">VC</div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // User has no groups — redirect to onboarding
  if (!loading && memberships.length === 0) {
    router.replace("/dashboard/onboarding/group");
    return null;
  }

  return <>{children}</>;
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <DashboardGuard>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            <ScrollToTopOnNav />
            <Suspense fallback={<DashboardSkeleton />}>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
    </DashboardGuard>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <GroupProvider>
        <DashboardLayoutInner>{children}</DashboardLayoutInner>
      </GroupProvider>
    </Suspense>
  );
}
