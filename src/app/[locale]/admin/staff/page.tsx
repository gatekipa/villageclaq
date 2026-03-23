"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Shield,
  ShieldCheck,
  Headphones,
  TrendingUp,
  Wallet,
  Plus,
  MoreHorizontal,
  UserCog,
  UserMinus,
  Ban,
  Clock,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StaffRole = "super_admin" | "admin" | "support" | "sales" | "finance";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  joinedAt: string;
  lastActive: string;
  avatar: string;
}

interface ActivityLog {
  id: string;
  staffName: string;
  action: string;
  target: string;
  timestamp: string;
}

const roleColors: Record<StaffRole, string> = {
  super_admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  support: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  sales: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  finance: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const roleIcons: Record<StaffRole, typeof Shield> = {
  super_admin: ShieldCheck,
  admin: Shield,
  support: Headphones,
  sales: TrendingUp,
  finance: Wallet,
};

const mockStaff: StaffMember[] = [
  {
    id: "1",
    name: "Jude Anyere",
    email: "jude@villageclaq.com",
    role: "super_admin",
    joinedAt: "2024-01-15",
    lastActive: "2026-03-23",
    avatar: "JA",
  },
  {
    id: "2",
    name: "Marie Nguemo",
    email: "marie@villageclaq.com",
    role: "admin",
    joinedAt: "2024-06-01",
    lastActive: "2026-03-22",
    avatar: "MN",
  },
  {
    id: "3",
    name: "Samuel Fon",
    email: "samuel@villageclaq.com",
    role: "support",
    joinedAt: "2025-01-10",
    lastActive: "2026-03-23",
    avatar: "SF",
  },
  {
    id: "4",
    name: "Grace Tabi",
    email: "grace@villageclaq.com",
    role: "sales",
    joinedAt: "2025-03-20",
    lastActive: "2026-03-21",
    avatar: "GT",
  },
  {
    id: "5",
    name: "Emmanuel Nkeng",
    email: "emmanuel@villageclaq.com",
    role: "finance",
    joinedAt: "2025-07-05",
    lastActive: "2026-03-23",
    avatar: "EN",
  },
];

const mockActivityLogs: ActivityLog[] = [
  {
    id: "1",
    staffName: "Jude Anyere",
    action: "Changed plan for group",
    target: "Bamenda Alumni Union",
    timestamp: "2026-03-23 14:30",
  },
  {
    id: "2",
    staffName: "Marie Nguemo",
    action: "Suspended user",
    target: "john.doe@email.com",
    timestamp: "2026-03-23 11:15",
  },
  {
    id: "3",
    staffName: "Samuel Fon",
    action: "Resolved enquiry",
    target: "Ticket #1042",
    timestamp: "2026-03-22 16:45",
  },
  {
    id: "4",
    staffName: "Grace Tabi",
    action: "Created voucher",
    target: "WELCOME2026",
    timestamp: "2026-03-22 09:20",
  },
  {
    id: "5",
    staffName: "Emmanuel Nkeng",
    action: "Exported revenue report",
    target: "Q1 2026",
    timestamp: "2026-03-21 17:00",
  },
];

export default function StaffPage() {
  const t = useTranslations("admin");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("staff")}</h1>
          <p className="text-sm text-muted-foreground">{t("staffSubtitle")}</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger
            render={
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t("addStaff")}
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("addStaff")}</DialogTitle>
              <DialogDescription>{t("addStaffDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{t("staffEmail")}</Label>
                <Input
                  type="email"
                  placeholder="staff@villageclaq.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("staffRole")}</Label>
                <Select value={newRole} onValueChange={(val) => setNewRole(val ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("roles.admin")}</SelectItem>
                    <SelectItem value="support">{t("roles.support")}</SelectItem>
                    <SelectItem value="sales">{t("roles.sales")}</SelectItem>
                    <SelectItem value="finance">{t("roles.finance")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => setAddDialogOpen(false)}
                className="gap-2"
              >
                {t("invite")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Staff list */}
      <div className="grid gap-4">
        {mockStaff.map((staff) => {
          const RoleIcon = roleIcons[staff.role];
          return (
            <Card key={staff.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {staff.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{staff.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {staff.email}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  <Badge
                    className={`gap-1.5 ${roleColors[staff.role]}`}
                  >
                    <RoleIcon className="h-3 w-3" />
                    {t(`roles.${staff.role}`)}
                  </Badge>

                  <div className="hidden text-right text-xs text-muted-foreground md:block">
                    <p>
                      {t("staffJoined")}: {staff.joinedAt}
                    </p>
                    <p>
                      {t("staffLastActive")}: {staff.lastActive}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent>
                      <DropdownMenuItem className="gap-2">
                        <UserCog className="h-4 w-4" />
                        {t("changeRole")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2">
                        <Ban className="h-4 w-4" />
                        {t("suspendStaff")}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-red-600 dark:text-red-400">
                        <UserMinus className="h-4 w-4" />
                        {t("removeStaff")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" />
            {t("staffActivity")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockActivityLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm">
                      <span className="font-medium">{log.staffName}</span>
                      {" — "}
                      {log.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.target}
                    </p>
                  </div>
                </div>
                <p className="pl-7 text-xs text-muted-foreground sm:pl-0">
                  {log.timestamp}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
