"use client";

import { useState, Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { GroupProvider, useGroup } from "@/lib/group-context";
import { useRouter, usePathname } from "@/i18n/routing";
import { DashboardSkeleton } from "@/components/ui/page-skeleton";
import { ScrollToTopOnNav } from "@/components/ui/scroll-to-top-on-nav";
import { SupportWidget } from "@/components/ui/support-widget";

/**
 * Pages that invited users (with 0 memberships) should be able to access
 * WITHOUT being forced into group-creation onboarding.
 */
const INVITE_SAFE_PATHS = [
  "/dashboard/my-invitations",
  "/dashboard/settings",
  "/dashboard/onboarding",
];

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { loading, memberships } = useGroup();
  const router = useRouter();
  const pathname = usePathname();

  // Allow onboarding pages to render without a group
  const isOnboardingPage = pathname.startsWith("/dashboard/onboarding");

  // Allow invite-safe pages to render without a group (so invited users
  // can accept invitations without being trapped in group-creation)
  const isInviteSafePage = INVITE_SAFE_PATHS.some((p) => pathname.startsWith(p));

  // Still loading — show skeleton (but not on onboarding/invite-safe pages)
  if (loading && !isOnboardingPage && !isInviteSafePage) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo-mark.svg" alt="VillageClaq" className="h-12 w-12 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // User has no groups — redirect to onboarding (unless on a safe page)
  if (!loading && memberships.length === 0 && !isOnboardingPage && !isInviteSafePage) {
    router.replace("/dashboard/onboarding/group");
    return null;
  }

  return <>{children}</>;
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { memberships, loading } = useGroup();
  const pathname = usePathname();

  const isOnboardingPage = pathname.startsWith("/dashboard/onboarding");

  // Onboarding pages + users with no groups render WITHOUT sidebar/header
  if (isOnboardingPage || (!loading && memberships.length === 0)) {
    return (
      <DashboardGuard>
        <main className="min-h-screen bg-background">
          <ScrollToTopOnNav />
          <Suspense fallback={<DashboardSkeleton />}>
            {children}
          </Suspense>
        </main>
      </DashboardGuard>
    );
  }

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
      <SupportWidget />
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
