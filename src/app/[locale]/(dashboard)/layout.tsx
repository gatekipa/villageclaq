"use client";

import { useState, useEffect, Suspense } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { GroupProvider, useGroup } from "@/lib/group-context";
import { useRouter, usePathname } from "@/i18n/routing";
import { DashboardSkeleton } from "@/components/ui/page-skeleton";
import { ScrollToTopOnNav } from "@/components/ui/scroll-to-top-on-nav";
import { SupportWidget } from "@/components/ui/support-widget";
import { createClient } from "@/lib/supabase/client";

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
  const { loading, memberships, user } = useGroup();
  const router = useRouter();
  const pathname = usePathname();
  const [checkingInvitations, setCheckingInvitations] = useState(false);
  const [checkedInvitations, setCheckedInvitations] = useState(false);

  // Allow onboarding pages to render without a group
  const isOnboardingPage = pathname.startsWith("/dashboard/onboarding");

  // Allow invite-safe pages to render without a group (so invited users
  // can accept invitations without being trapped in group-creation)
  const isInviteSafePage = INVITE_SAFE_PATHS.some((p) => pathname.startsWith(p));

  // When user has 0 memberships and is NOT on a safe page, check for pending invitations
  // before deciding whether to redirect to onboarding or my-invitations
  useEffect(() => {
    if (loading || memberships.length > 0 || isOnboardingPage || isInviteSafePage || checkingInvitations || checkedInvitations) return;
    if (!user) return;

    let cancelled = false;
    setCheckingInvitations(true);

    (async () => {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser || cancelled) { setCheckingInvitations(false); return; }

        // Check for pending invitations by email OR by claim (user_id match not applicable
        // since new users won't have claim invitations). Check by email.
        const email = authUser.email;
        if (!email) {
          // No email — cannot have email-based invitations, go to onboarding
          if (!cancelled) {
            setCheckedInvitations(true);
            setCheckingInvitations(false);
            router.replace("/dashboard/onboarding/group");
          }
          return;
        }

        const { count, error } = await supabase
          .from("invitations")
          .select("id", { count: "exact", head: true })
          .eq("email", email)
          .eq("status", "pending");

        if (cancelled) return;

        if (!error && count && count > 0) {
          // User has pending invitations — send them to my-invitations
          router.replace("/dashboard/my-invitations");
        } else {
          // No pending invitations — normal onboarding flow
          router.replace("/dashboard/onboarding/group");
        }
      } catch {
        // On error, fall back to onboarding
        if (!cancelled) router.replace("/dashboard/onboarding/group");
      } finally {
        if (!cancelled) {
          setCheckingInvitations(false);
          setCheckedInvitations(true);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [loading, memberships.length, isOnboardingPage, isInviteSafePage, checkingInvitations, checkedInvitations, user, router]);

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

  // Checking for pending invitations — show loading
  if (checkingInvitations) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo-mark.svg" alt="VillageClaq" className="h-12 w-12 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { memberships, loading } = useGroup();
  const pathname = usePathname();

  const isOnboardingPage = pathname.startsWith("/dashboard/onboarding");
  const isInviteSafePage = INVITE_SAFE_PATHS.some((p) => pathname.startsWith(p));

  // Onboarding pages + users with no groups render WITHOUT sidebar/header
  // Also: invite-safe pages for users with 0 memberships render without sidebar
  if (isOnboardingPage || (!loading && memberships.length === 0 && isInviteSafePage)) {
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

  // Normal layout with sidebar for users with memberships
  // (also handles the brief window where DashboardGuard is checking invitations)
  if (!loading && memberships.length === 0) {
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
