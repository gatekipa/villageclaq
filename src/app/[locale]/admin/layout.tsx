"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  Building2,
  Shield,
  CreditCard,
  Ticket,
  DollarSign,
  FileText,
  MessageSquare,
  ClipboardList,
  X,
  Menu,
} from "lucide-react";

const navItems = [
  { key: "dashboard", href: "/admin", icon: LayoutDashboard },
  { key: "groups", href: "/admin/groups", icon: Building2 },
  { key: "users", href: "/admin/users", icon: Users },
  { key: "staff", href: "/admin/staff", icon: Shield },
  { key: "subscriptions", href: "/admin/subscriptions", icon: CreditCard },
  { key: "vouchers", href: "/admin/vouchers", icon: Ticket },
  { key: "revenue", href: "/admin/revenue", icon: DollarSign },
  { key: "content", href: "/admin/content", icon: FileText },
  { key: "enquiries", href: "/admin/enquiries", icon: MessageSquare },
  { key: "audit", href: "/admin/audit", icon: ClipboardList },
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin");
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
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
        <div className="flex h-16 items-center justify-between px-6">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white font-bold text-sm">VC</div>
            <div>
              <span className="text-sm font-bold text-emerald-400">VillageClaq</span>
              <span className="block text-[10px] text-slate-400">Platform Admin</span>
            </div>
          </Link>
          <Button variant="ghost" size="icon" className="text-white lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-700 px-4 py-3">
          <p className="text-xs text-slate-500">LawTekno LLC</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
