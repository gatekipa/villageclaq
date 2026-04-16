"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname, Link, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, Users, Building2, Shield, CreditCard,
  DollarSign, FileText, MessageSquare, ClipboardList,
  X, Menu, ShieldAlert, LogOut, ChevronDown,
  BarChart3, Activity, Layers, Settings, Bell, Database,
  Lock, HelpCircle, Globe, Wifi, WifiOff, Scale, Ticket,
  type LucideIcon,
} from "lucide-react";

// ─── Sidebar section definitions ──────────────────────────────────────────

interface NavItem { key: string; href: string; icon: LucideIcon }
interface NavSection { sectionKey: string; items: NavItem[]; defaultOpen?: boolean }

const navSections: NavSection[] = [
  {
    sectionKey: "sectionPlatformOverview",
    defaultOpen: true,
    items: [
      { key: "dashboard", href: "/admin", icon: LayoutDashboard },
      { key: "platformOverview", href: "/admin/overview", icon: BarChart3 },
      { key: "usageAnalytics", href: "/admin/analytics", icon: Activity },
    ],
  },
  {
    sectionKey: "sectionUsersAndGroups",
    items: [
      { key: "groups", href: "/admin/groups", icon: Building2 },
      { key: "groupTypes", href: "/admin/group-types", icon: Layers },
      { key: "users", href: "/admin/users", icon: Users },
      { key: "groupAdministrators", href: "/admin/group-admins", icon: Shield },
      { key: "groupAdminActions", href: "/admin/group-actions", icon: ClipboardList },
      { key: "multiGroupParticipation", href: "/admin/multi-group", icon: Globe },
    ],
  },
  {
    sectionKey: "sectionFinancialControls",
    items: [
      { key: "transactionsMonitor", href: "/admin/transactions", icon: DollarSign },
      { key: "offlinePayments", href: "/admin/offline-payments", icon: WifiOff },
      { key: "feeMonetization", href: "/admin/subscriptions", icon: CreditCard },
      { key: "subscriptionPlans", href: "/admin/plans", icon: CreditCard },
      { key: "anomalyMonitoring", href: "/admin/anomalies", icon: ShieldAlert },
      { key: "vouchers", href: "/admin/vouchers", icon: Ticket },
    ],
  },
  {
    sectionKey: "sectionReports",
    items: [
      { key: "reportsHub", href: "/admin/reports", icon: BarChart3 },
      { key: "financialReports", href: "/admin/reports/financial", icon: DollarSign },
      { key: "engagementReports", href: "/admin/reports/engagement", icon: Activity },
      { key: "membershipReports", href: "/admin/reports/membership", icon: Users },
      { key: "attendanceReports", href: "/admin/reports/attendance", icon: ClipboardList },
      { key: "reliefPlanReports", href: "/admin/reports/relief", icon: Shield },
    ],
  },
  {
    sectionKey: "sectionSystemConfiguration",
    items: [
      { key: "globalSettings", href: "/admin/settings", icon: Settings },
      { key: "notificationsManagement", href: "/admin/notifications", icon: Bell },
      { key: "paymentIntegrations", href: "/admin/integrations", icon: CreditCard },
      { key: "dataSecurity", href: "/admin/security", icon: Database },
      { key: "offlineSupport", href: "/admin/offline-status", icon: Wifi },
    ],
  },
  {
    sectionKey: "sectionAccessControl",
    items: [
      { key: "staff", href: "/admin/staff", icon: Shield },
      { key: "rolePermissions", href: "/admin/permissions", icon: Lock },
      { key: "audit", href: "/admin/audit", icon: ClipboardList },
    ],
  },
  {
    sectionKey: "sectionContentManagement",
    items: [
      { key: "testimonials", href: "/admin/content", icon: FileText },
      { key: "faqs", href: "/admin/content?tab=faqs", icon: HelpCircle },
      { key: "enquiries", href: "/admin/enquiries", icon: MessageSquare },
    ],
  },
];

// ─── Platform Admin Guard ─────────────────────────────────────────────────

function PlatformAdminGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "authorized" | "denied">("loading");
  const router = useRouter();
  const t = useTranslations("admin");

  // Stable ref — useRouter() may return a new object on every render.
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    async function checkAccess() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { routerRef.current.replace("/login"); return; }
      const { data: staff } = await supabase
        .from("platform_staff")
        .select("id, role, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      setStatus(staff ? "authorized" : "denied");
    }
    checkAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router accessed via stable ref
  }, []);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo-mark.svg" alt="VillageClaq" className="h-12 w-12 animate-pulse" />
          <p className="text-sm text-muted-foreground animate-pulse">{t("verifyingAccess")}</p>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <ShieldAlert className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-bold">{t("accessDenied")}</h2>
          <p className="text-sm text-muted-foreground">{t("accessDeniedDesc")}</p>
          <Button onClick={() => router.replace("/dashboard")}>{t("goToDashboard")}</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ─── Collapsible Section Component ────────────────────────────────────────

function SidebarSection({
  section, pathname, t, onNavigate,
}: {
  section: NavSection;
  pathname: string;
  t: ReturnType<typeof useTranslations>;
  onNavigate: () => void;
}) {
  const storageKey = `admin-nav-${section.sectionKey}`;
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return !!section.defaultOpen;
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) return stored === "1";
    return !!section.defaultOpen;
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    localStorage.setItem(storageKey, next ? "1" : "0");
  }

  // Auto-expand if active item is in this section
  const hasActive = section.items.some(
    (item) => pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
  );

  useEffect(() => {
    if (hasActive && !open) {
      setOpen(true);
      localStorage.setItem(storageKey, "1");
    }
  }, [hasActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mb-1">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
      >
        <span>{t(section.sectionKey as Parameters<typeof t>[0])}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open && (
        <div className="space-y-0.5 mt-0.5">
          {section.items.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href.split("?")[0]));
            return (
              <Link
                key={item.key + item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                  isActive ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {t(item.key as Parameters<typeof t>[0])}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Admin Layout ─────────────────────────────────────────────────────────

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminName, setAdminName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAdminName() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      setAdminName(profile?.full_name || user.email || null);
    }
    fetchAdminName();
  }, []);

  return (
    <PlatformAdminGuard>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-white transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Logo */}
          <div className="flex h-14 items-center justify-between px-4 border-b border-slate-800">
            <Link href="/admin" className="flex items-center gap-2">
              <img src="/logo-mark.svg" alt="VillageClaq" className="h-8 w-8" />
              <div>
                <span className="text-sm font-bold text-emerald-400">VillageClaq</span>
                <span className="block text-[9px] text-slate-500">{t("superAdmin")}</span>
              </div>
            </Link>
            <Button variant="ghost" size="icon" className="text-white lg:hidden h-7 w-7" onClick={() => setSidebarOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Nav sections */}
          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
            {navSections.map((section) => (
              <SidebarSection
                key={section.sectionKey}
                section={section}
                pathname={pathname}
                t={t}
                onNavigate={() => setSidebarOpen(false)}
              />
            ))}
          </nav>

          {/* Bottom card */}
          <div className="border-t border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold">
                {adminName ? adminName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "VC"}
              </div>
              <div>
                <p className="text-xs font-medium text-slate-300">{adminName || "Admin"}</p>
                <p className="text-[10px] text-slate-500">VillageClaq Staff</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center justify-between gap-4 border-b px-4 lg:px-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <h2 className="text-lg font-semibold">{t("title")}</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("signOut")}
            </Button>
          </header>
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </PlatformAdminGuard>
  );
}
