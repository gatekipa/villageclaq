"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import { useGroup } from "@/lib/group-context";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  HelpCircle,
  HandCoins,
  UserPlus,
  X,
  BarChart3,
  ClipboardCheck,
  Home,
  BookOpen,
  Heart,
  CreditCard,
  Bell,
  UserCircle,
  Contact,
  PieChart,
  GitBranch,
  Megaphone,
  RefreshCw,
  Vote,
  FolderLock,
  Activity,
  FolderKanban,
  Trophy,
  MessageSquare,
  ShieldCheck,
  IdCard,
  ScrollText,
  Mail,
  KeyRound,
  Landmark,
  Gavel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  /** If set, only show this link when user has this permission (or is admin/owner) */
  permission?: string;
  /** If set, show when user has ANY of these permissions */
  anyPermission?: string[];
}

interface NavSection {
  labelKey: string;
  items: NavItem[];
}

const adminSections: NavSection[] = [
  {
    labelKey: "sectionOverview",
    items: [
      { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { key: "feed", href: "/dashboard/feed", icon: Activity },
    ],
  },
  {
    labelKey: "sectionPeople",
    items: [
      { key: "members", href: "/dashboard/members", icon: Users },
      { key: "roles", href: "/dashboard/roles", icon: ShieldCheck, permission: "roles.manage" },
      { key: "subGroups", href: "/dashboard/sub-groups", icon: GitBranch, permission: "members.manage" },
      { key: "invitations", href: "/dashboard/invitations", icon: UserPlus, anyPermission: ["members.manage", "members.invite"] },
    ],
  },
  {
    labelKey: "sectionMoney",
    items: [
      { key: "contributions", href: "/dashboard/contributions", icon: HandCoins, anyPermission: ["contributions.manage", "finances.view", "finances.manage", "finances.record"] },
      { key: "finances", href: "/dashboard/finances", icon: CreditCard, anyPermission: ["finances.manage", "finances.view"] },
      { key: "loans", href: "/dashboard/loans", icon: Landmark, anyPermission: ["contributions.manage", "finances.manage"] },
    ],
  },
  {
    labelKey: "sectionEventsOps",
    items: [
      { key: "events", href: "/dashboard/events", icon: Calendar },
      { key: "attendance", href: "/dashboard/attendance", icon: ClipboardCheck },
      { key: "hosting", href: "/dashboard/hosting", icon: Home },
      { key: "minutes", href: "/dashboard/minutes", icon: BookOpen },
    ],
  },
  {
    labelKey: "sectionGroupFeatures",
    items: [
      { key: "savingsCircle", href: "/dashboard/savings-circle", icon: RefreshCw },
      { key: "elections", href: "/dashboard/elections", icon: Vote },
      { key: "relief", href: "/dashboard/relief", icon: Heart },
      { key: "constitution", href: "/dashboard/constitution", icon: ScrollText },
      { key: "documents", href: "/dashboard/documents", icon: FolderLock },
      { key: "announcements", href: "/dashboard/announcements", icon: Megaphone },
      { key: "projects", href: "/dashboard/projects", icon: FolderKanban },
      { key: "fines", href: "/dashboard/fines", icon: Gavel, anyPermission: ["disputes.manage", "finances.manage"] },
    ],
  },
  {
    labelKey: "sectionAnalytics",
    items: [
      { key: "reports", href: "/dashboard/reports", icon: PieChart, anyPermission: ["reports.view", "reports.export"] },
      { key: "badges", href: "/dashboard/badges", icon: Trophy },
      { key: "activityLog", href: "/dashboard/activity-log", icon: ScrollText, permission: "settings.manage" },
    ],
  },
];

const adminEnterprise: NavSection = {
  labelKey: "sectionEnterprise",
  items: [
    { key: "enterprise", href: "/dashboard/enterprise", icon: Activity },
    { key: "branches", href: "/dashboard/enterprise/branches", icon: GitBranch },
    { key: "exchangeRates", href: "/dashboard/enterprise/exchange-rates", icon: RefreshCw },
  ],
};

const memberSections: NavSection[] = [
  {
    labelKey: "sectionOverview",
    items: [
      { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
      { key: "feed", href: "/dashboard/feed", icon: Activity },
    ],
  },
  {
    labelKey: "sectionMyAccount",
    items: [
      { key: "myPayments", href: "/dashboard/my-payments", icon: CreditCard },
      { key: "myEvents", href: "/dashboard/my-events", icon: Calendar },
      { key: "myInvitations", href: "/dashboard/my-invitations", icon: Mail },
      { key: "myAttendance", href: "/dashboard/my-attendance", icon: ClipboardCheck },
      { key: "myHosting", href: "/dashboard/my-hosting", icon: Home },
      { key: "myRelief", href: "/dashboard/relief/my", icon: Heart },
      { key: "myLoans", href: "/dashboard/my-loans", icon: Landmark },
      { key: "myFines", href: "/dashboard/my-fines", icon: Gavel },
      { key: "myFamily", href: "/dashboard/my-family", icon: Contact },
      { key: "membershipCard", href: "/dashboard/membership-card", icon: IdCard },
      { key: "changePassword", href: "/dashboard/change-password", icon: KeyRound },
    ],
  },
  {
    labelKey: "sectionGroup",
    items: [
      { key: "directory", href: "/dashboard/directory", icon: Users },
      { key: "minutes", href: "/dashboard/minutes", icon: BookOpen },
      { key: "constitution", href: "/dashboard/constitution", icon: ScrollText },
      { key: "documents", href: "/dashboard/documents", icon: FolderLock },
      { key: "badges", href: "/dashboard/badges", icon: Trophy },
      { key: "notifications", href: "/dashboard/notifications", icon: Bell },
    ],
  },
];

const adminBottomItems: NavItem[] = [
  { key: "feedback", href: "/dashboard/feedback", icon: MessageSquare },
  { key: "settings", href: "/dashboard/settings", icon: Settings, permission: "settings.manage" },
  { key: "help", href: "/dashboard/help", icon: HelpCircle },
];

const memberBottomItems: NavItem[] = [
  { key: "feedback", href: "/dashboard/feedback", icon: MessageSquare },
  { key: "profile", href: "/dashboard/my-profile", icon: UserCircle },
  { key: "help", href: "/dashboard/help", icon: HelpCircle },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { isAdmin, isPlatformStaff, currentGroup } = useGroup();
  const { hasPermission, hasAnyPermission, userPermissions } = usePermissions();
  const { groupId } = useGroup();

  // Check if loan_config exists for this group (lightweight query)
  const { data: hasLoanConfig } = useQuery({
    queryKey: ["loan-config-exists", groupId],
    queryFn: async () => {
      if (!groupId) return false;
      const supabase = createClient();
      const { data } = await supabase
        .from("loan_configs")
        .select("id")
        .eq("group_id", groupId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  // Show admin nav if user is admin/owner OR has any position-based permissions
  const showAdminNav = isAdmin || userPermissions.length > 0;
  const sections = showAdminNav ? adminNavSections() : memberSections;
  const bottomItems = showAdminNav ? adminBottomItems : memberBottomItems;

  function adminNavSections(): NavSection[] {
    const base = [...adminSections];
    // Enterprise section only visible when current group is HQ level and user is admin/owner
    if (isAdmin && currentGroup?.group_level === "hq") base.push(adminEnterprise);
    return base;
  }

  function itemVisible(item: NavItem): boolean {
    // Hide loan sidebar entries when no loan config exists (except for admins who can set up)
    if ((item.key === "loans" || item.key === "myLoans") && !hasLoanConfig && !isAdmin) return false;
    if (isAdmin) return true; // Owner/admin see everything
    if (!item.permission && !item.anyPermission) return true; // No permission required
    if (item.permission) return hasPermission(item.permission);
    if (item.anyPermission) return hasAnyPermission(...item.anyPermission);
    return true;
  }

  function isActive(href: string): boolean {
    if (href === "/dashboard" || href === "/dashboard/my-dashboard") {
      return pathname === href;
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <img src="/logo-mark.svg" alt="VillageClaq" className="h-[60px] w-[60px]" />
            <span className="text-xl font-bold text-sidebar-primary">
              VillageClaq
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section, sectionIndex) => (
            <div key={section.labelKey}>
              <p
                className={cn(
                  "px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40",
                  sectionIndex === 0 ? "mt-0" : "mt-6"
                )}
              >
                {t(section.labelKey)}
              </p>
              <div className="space-y-1">
                {section.items.filter(itemVisible).map((item) => (
                  <Link
                    key={item.key + item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive(item.href)
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {t(item.key)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="border-t border-sidebar-border px-3 py-4 space-y-1">
          {bottomItems.filter(itemVisible).map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {t(item.key)}
            </Link>
          ))}

          {isPlatformStaff && (
            <Link
              href="/admin"
              onClick={onClose}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {t("adminPanel")}
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
