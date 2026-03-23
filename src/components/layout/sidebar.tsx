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
  FileText,
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
  User,
  UserCircle,
  Contact,
  PieChart,
  GitBranch,
  Megaphone,
  RefreshCw,
  Vote,
  FolderLock,
  Activity,
  Banknote,
  AlertTriangle,
  FolderKanban,
  Trophy,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavItem {
  key: string;
  href: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  memberOnly?: boolean;
}

const adminNavItems: NavItem[] = [
  { key: "feed", href: "/dashboard/feed", icon: Activity },
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: true },
  { key: "members", href: "/dashboard/members", icon: Users, adminOnly: true },
  { key: "invitations", href: "/dashboard/invitations", icon: UserPlus, adminOnly: true },
  { key: "contributions", href: "/dashboard/contributions", icon: HandCoins, adminOnly: true },
  { key: "finances", href: "/dashboard/finances", icon: BarChart3, adminOnly: true },
  { key: "fines", href: "/dashboard/fines", icon: AlertTriangle, adminOnly: true },
  { key: "loans", href: "/dashboard/loans", icon: Banknote, adminOnly: true },
  { key: "projects", href: "/dashboard/projects", icon: FolderKanban, adminOnly: true },
  { key: "events", href: "/dashboard/events", icon: Calendar, adminOnly: true },
  { key: "attendance", href: "/dashboard/attendance", icon: ClipboardCheck, adminOnly: true },
  { key: "hosting", href: "/dashboard/hosting", icon: Home, adminOnly: true },
  { key: "minutes", href: "/dashboard/minutes", icon: BookOpen },
  { key: "savingsCircle", href: "/dashboard/savings-circle", icon: RefreshCw, adminOnly: true },
  { key: "elections", href: "/dashboard/elections", icon: Vote, adminOnly: true },
  { key: "relief", href: "/dashboard/relief", icon: Heart, adminOnly: true },
  { key: "reports", href: "/dashboard/reports", icon: PieChart, adminOnly: true },
  { key: "announcements", href: "/dashboard/announcements", icon: Megaphone, adminOnly: true },
  { key: "badges", href: "/dashboard/badges", icon: Trophy },
  { key: "enterprise", href: "/dashboard/enterprise", icon: GitBranch, adminOnly: true },
  { key: "documents", href: "/dashboard/documents", icon: FolderLock },
];

const memberNavItems: NavItem[] = [
  { key: "feed", href: "/dashboard/feed", icon: Activity },
  { key: "dashboard", href: "/dashboard/my-dashboard", icon: LayoutDashboard, memberOnly: true },
  { key: "myPayments", href: "/dashboard/my-payments", icon: CreditCard, memberOnly: true },
  { key: "myEvents", href: "/dashboard/my-events", icon: Calendar, memberOnly: true },
  { key: "myAttendance", href: "/dashboard/my-attendance", icon: ClipboardCheck, memberOnly: true },
  { key: "myHosting", href: "/dashboard/my-hosting", icon: Home, memberOnly: true },
  { key: "myRelief", href: "/dashboard/relief/my", icon: Heart, memberOnly: true },
  { key: "myFamily", href: "/dashboard/my-family", icon: Contact, memberOnly: true },
  { key: "directory", href: "/dashboard/directory", icon: Users, memberOnly: true },
  { key: "minutes", href: "/dashboard/minutes", icon: BookOpen },
  { key: "notifications", href: "/dashboard/notifications", icon: Bell, memberOnly: true },
];

const adminBottomItems: NavItem[] = [
  { key: "feedback", href: "/dashboard/feedback", icon: MessageSquare },
  { key: "settings", href: "/dashboard/settings", icon: Settings, adminOnly: true },
  { key: "help", href: "/dashboard/help", icon: HelpCircle },
];

const memberBottomItems: NavItem[] = [
  { key: "feedback", href: "/dashboard/feedback", icon: MessageSquare },
  { key: "profile", href: "/dashboard/my-profile", icon: UserCircle, memberOnly: true },
  { key: "help", href: "/dashboard/help", icon: HelpCircle },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { isAdmin } = useGroup();

  const navItems = isAdmin ? adminNavItems : memberNavItems;
  const bottomItems = isAdmin ? adminBottomItems : memberBottomItems;

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
            <img src="/logo-mark.svg" alt="VillageClaq" className="h-8 w-8" />
            <span className="text-lg font-bold text-sidebar-primary">
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
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && item.href !== "/dashboard/my-dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        {/* Bottom nav */}
        <div className="border-t border-sidebar-border px-3 py-4 space-y-1">
          {bottomItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      </aside>
    </>
  );
}
