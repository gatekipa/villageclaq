"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useTranslations } from "next-intl";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { GroupProvider, useGroup, type GroupMembership } from "@/lib/group-context";
import { useRouter, usePathname, Link } from "@/i18n/routing";
import { DashboardSkeleton } from "@/components/ui/page-skeleton";
import { ScrollToTopOnNav } from "@/components/ui/scroll-to-top-on-nav";
import { SupportWidget } from "@/components/ui/support-widget";
import { createClient } from "@/lib/supabase/client";
import { Clock, Archive, Phone, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Pages that invited users (with 0 memberships) should be able to access
 * WITHOUT being forced into group-creation onboarding.
 */
const INVITE_SAFE_PATHS = [
  "/dashboard/my-invitations",
  "/dashboard/settings",
  "/dashboard/onboarding",
];

function PendingApprovalScreen({
  currentMembership,
  memberships,
}: {
  currentMembership: GroupMembership;
  memberships: GroupMembership[];
}) {
  const tj = useTranslations("join");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const supabase = createClient();
  const activeMemberships = memberships.filter(
    (m) => m.membership_status !== "pending_approval"
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <img src="/logo-mark.svg" alt="VillageClaq" className="mb-8 h-10 w-10" />
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mx-auto">
          <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">{tj("pendingApprovalInterstitialTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {tj("pendingApprovalInterstitialDesc", { group: currentMembership.group.name })}
          </p>
        </div>
        {activeMemberships.length > 0 && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              router.push("/dashboard");
              // Force group context to pick a non-pending membership
              setTimeout(() => window.location.reload(), 100);
            }}
          >
            {tj("pendingApprovalInterstitialSwitch")}
          </Button>
        )}
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={handleSignOut}
        >
          {tCommon("signOut")}
        </button>
      </div>
    </div>
  );
}

function DeactivatedGroupScreen({
  currentMembership,
  memberships,
}: {
  currentMembership: GroupMembership;
  memberships: GroupMembership[];
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const supabase = createClient();
  const isOwner = currentMembership.role === "owner";
  const otherActiveMemberships = memberships.filter(
    (m) => m.group_id !== currentMembership.group_id && m.group?.is_active !== false
  );

  async function handleReactivate() {
    await supabase.from("groups").update({ is_active: true }).eq("id", currentMembership.group_id);
    window.location.reload();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <img src="/logo-mark.svg" alt="VillageClaq" className="mb-8 h-10 w-10" />
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm text-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mx-auto">
          <Archive className="h-8 w-8 text-slate-500 dark:text-slate-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">{t("deactivateGroupScreen.title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("deactivateGroupScreen.desc")}
          </p>
        </div>
        {isOwner && (
          <Button className="w-full" onClick={handleReactivate}>
            {t("deactivateGroupScreen.reactivate")}
          </Button>
        )}
        {otherActiveMemberships.length > 0 ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              // Switch localStorage to the first active group so the context
              // picks it up on reload instead of re-selecting the deactivated one.
              const nextGroup = otherActiveMemberships[0];
              if (nextGroup && typeof window !== "undefined") {
                localStorage.setItem("villageclaq_current_group", nextGroup.group_id);
              }
              router.push("/dashboard");
              setTimeout(() => window.location.reload(), 100);
            }}
          >
            {t("deactivateGroupScreen.switch")}
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
          >
            {tCommon("signOut")}
          </Button>
        )}
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={handleSignOut}
        >
          {tCommon("signOut")}
        </button>
      </div>
    </div>
  );
}

/**
 * Phone collection rendered as a Dialog overlay — NOT a full-screen replacement.
 * This is critical to prevent flickering: the underlying layout (Sidebar, Header,
 * page content) stays mounted while the dialog is open. Previously this was a
 * full-page interstitial that unmounted the entire layout tree.
 */
function PhoneCollectionDialog({
  open,
  onSaved,
  onSkip,
}: {
  open: boolean;
  onSaved: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations("onboarding");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (!phone.trim()) {
      setSaveError(t("addPhone.invalid"));
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ phone: phone.trim() })
        .eq("id", user.id);
      if (error) {
        setSaveError(error.message);
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSkip(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">{t("addPhone.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="text-center space-y-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto">
              <Phone className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold">{t("addPhone.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("addPhone.subtitle")}</p>
          </div>
          <PhoneInput value={phone} onChange={setPhone} defaultCountryCode="+237" />
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={saving || !phone.trim()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("addPhone.continue")}
          </Button>
          <button
            className="w-full text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={onSkip}
            type="button"
          >
            {t("addPhone.skip")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PhoneBanner({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4 dark:border-amber-800/50 dark:bg-amber-950/20">
      <Phone className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
        {t("dashboard.phoneBanner.message")}
      </p>
      <Link href="/dashboard/my-profile">
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
        >
          {t("dashboard.phoneBanner.addPhone")}
        </Button>
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400"
        aria-label={t("dashboard.phoneBanner.dismiss")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { loading, memberships, user, currentMembership } = useGroup();
  const router = useRouter();
  const pathname = usePathname();
  const tCommon = useTranslations("common");
  const [checkingInvitations, setCheckingInvitations] = useState(false);
  const [checkedInvitations, setCheckedInvitations] = useState(false);

  // Phone collection dialog state (rendered as Dialog overlay — never unmounts layout)
  const [phoneSkipped, setPhoneSkipped] = useState(true);
  const [phoneStateLoaded, setPhoneStateLoaded] = useState(false);
  const [phoneSavedLocal, setPhoneSavedLocal] = useState(false);

  // CRITICAL: Once we've rendered the real layout at least once, NEVER go back to
  // the full-screen loading spinner. This prevents flicker on refetches (refresh(),
  // token refresh, navigation, etc.). Only the very first load shows the spinner.
  const hasRenderedContent = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const skipped = sessionStorage.getItem("vc_phone_skipped") === "1";
      setPhoneSkipped(skipped);
    } else {
      setPhoneSkipped(false);
    }
    setPhoneStateLoaded(true);
  }, []);

  const isOnboardingPage = pathname.startsWith("/dashboard/onboarding");
  const isInviteSafePage = INVITE_SAFE_PATHS.some((p) => pathname.startsWith(p));

  // When user has 0 memberships and is NOT on a safe page, check for pending invitations
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

        const email = authUser.email;
        if (!email) {
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
          router.replace("/dashboard/my-invitations");
        } else {
          router.replace("/dashboard/onboarding/group");
        }
      } catch {
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

  // Determine if we should show the initial loading spinner.
  // Once content has rendered, NEVER show the spinner again — this is the
  // anti-flicker guard. Only the very first load sees a full-screen spinner.
  const showInitialLoading = loading && !isOnboardingPage && !isInviteSafePage && !hasRenderedContent.current;
  const showInviteChecking = checkingInvitations && !hasRenderedContent.current;

  if (showInitialLoading || showInviteChecking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo-mark.svg" alt="VillageClaq" className="h-12 w-12 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">{tCommon("loading")}</p>
        </div>
      </div>
    );
  }

  // Pending approval interstitial — legitimate blocker (user can't use the app)
  if (!loading && currentMembership?.membership_status === "pending_approval") {
    return (
      <PendingApprovalScreen
        currentMembership={currentMembership}
        memberships={memberships}
      />
    );
  }

  // Deactivated group interstitial — legitimate blocker
  if (!loading && currentMembership && currentMembership.group?.is_active === false && !isOnboardingPage && !isInviteSafePage) {
    return (
      <DeactivatedGroupScreen
        currentMembership={currentMembership}
        memberships={memberships}
      />
    );
  }

  // Mark that we've rendered real content — from this point, the loading
  // spinner will never show again (prevents flicker on refetches).
  hasRenderedContent.current = true;

  // Phone collection dialog — shown as an OVERLAY, not a page replacement.
  // The layout (Sidebar, Header, children) stays mounted underneath.
  const hasPhone = !!(user?.phone) || phoneSavedLocal;
  const showPhoneDialog =
    phoneStateLoaded &&
    !phoneSkipped &&
    !loading &&
    !hasPhone &&
    !isOnboardingPage &&
    !isInviteSafePage &&
    memberships.length > 0;

  return (
    <>
      {children}
      <PhoneCollectionDialog
        open={showPhoneDialog}
        onSaved={() => {
          setPhoneSavedLocal(true);
        }}
        onSkip={() => {
          if (typeof window !== "undefined") {
            sessionStorage.setItem("vc_phone_skipped", "1");
          }
          setPhoneSkipped(true);
        }}
      />
    </>
  );
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { memberships, loading, user } = useGroup();
  const pathname = usePathname();
  // Phone banner state — shown after user skips the phone collection prompt
  const [bannerDismissed, setBannerDismissed] = useState(true); // true = hidden until loaded
  const [phoneSkippedForBanner, setPhoneSkippedForBanner] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPhoneSkippedForBanner(
        sessionStorage.getItem("vc_phone_skipped") === "1"
      );
      setBannerDismissed(
        sessionStorage.getItem("vc_phone_banner_dismissed") === "1"
      );
    }
  }, []);

  const showPhoneBanner =
    !loading &&
    !user?.phone &&
    phoneSkippedForBanner &&
    !bannerDismissed &&
    memberships.length > 0;

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
            {showPhoneBanner && (
              <PhoneBanner
                onDismiss={() => {
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("vc_phone_banner_dismissed", "1");
                  }
                  setBannerDismissed(true);
                }}
              />
            )}
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
