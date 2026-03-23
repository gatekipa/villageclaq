"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldCheck,
  Crown,
} from "lucide-react";

type Standing = "good" | "warning" | "suspended" | "banned";

interface Member {
  id: string;
  name: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
  position?: string;
  standing: Standing;
  isProxy: boolean;
  proxyManager?: string;
  joinedAt: string;
  phone?: string;
  email?: string;
  isExecutive: boolean;
}

const mockMembers: Member[] = [
  { id: "1", name: "Cyril Ndonwi", role: "owner", position: "President", standing: "good", isProxy: false, joinedAt: "2024-01-15", email: "cyril@test.com", phone: "+1-202-555-0101", isExecutive: true },
  { id: "2", name: "Jean-Pierre Kamga", role: "admin", position: "Vice President", standing: "good", isProxy: false, joinedAt: "2024-01-15", email: "jp@test.com", isExecutive: true },
  { id: "3", name: "Sylvie Mbarga", role: "admin", position: "Treasurer", standing: "good", isProxy: false, joinedAt: "2024-02-01", email: "sylvie@test.com", isExecutive: true },
  { id: "4", name: "Emmanuel Tabi", role: "moderator", position: "Secretary", standing: "good", isProxy: false, joinedAt: "2024-02-10", isExecutive: true },
  { id: "5", name: "Marie-Claire Fotso", role: "member", standing: "good", isProxy: false, joinedAt: "2024-03-05", isExecutive: false },
  { id: "6", name: "Patrick Njoya", role: "member", standing: "warning", isProxy: false, joinedAt: "2024-03-20", isExecutive: false },
  { id: "7", name: "Beatrice Ngono", role: "member", standing: "good", isProxy: false, joinedAt: "2024-04-01", isExecutive: false },
  { id: "8", name: "Thomas Nkeng", role: "member", standing: "suspended", isProxy: false, joinedAt: "2024-04-15", isExecutive: false },
  { id: "9", name: "Papa François Mbeki", role: "member", standing: "good", isProxy: true, proxyManager: "Cyril Ndonwi", joinedAt: "2024-05-01", isExecutive: false },
  { id: "10", name: "Angeline Tchatchouang", role: "member", standing: "good", isProxy: false, joinedAt: "2024-06-10", isExecutive: false },
  { id: "11", name: "Samuel Fon", role: "member", standing: "warning", isProxy: false, joinedAt: "2024-07-01", isExecutive: false },
  { id: "12", name: "Grace Eteki", role: "member", standing: "good", isProxy: false, joinedAt: "2024-07-20", isExecutive: false },
];

const standingConfig: Record<Standing, { color: string; dotColor: string }> = {
  good: { color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dotColor: "bg-emerald-500" },
  warning: { color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", dotColor: "bg-yellow-500" },
  suspended: { color: "bg-red-500/10 text-red-700 dark:text-red-400", dotColor: "bg-red-500" },
  banned: { color: "bg-red-900/10 text-red-900 dark:text-red-300", dotColor: "bg-red-900" },
};

const roleIcons: Record<string, typeof Shield> = {
  owner: Crown,
  admin: ShieldCheck,
  moderator: Shield,
};

export default function MembersPage() {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const filtered = mockMembers.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
    if (tab === "executive") return matchesSearch && m.isExecutive;
    if (tab === "regular") return matchesSearch && !m.isExecutive;
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("members.title")}</h1>
          <p className="text-muted-foreground">{t("members.subtitle")}</p>
        </div>
        <Link href="/dashboard/invitations">
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            {t("members.inviteMember")}
          </Button>
        </Link>
      </div>

      {/* Search + Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("members.searchMembers")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">
              {t("members.allMembers")}
              <Badge variant="secondary" className="ml-1.5">{mockMembers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="executive">{t("members.executive")}</TabsTrigger>
            <TabsTrigger value="regular">{t("members.regular")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Member Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">{t("members.noMembers")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member) => {
            const standing = standingConfig[member.standing];
            const RoleIcon = roleIcons[member.role];
            return (
              <Link key={member.id} href={`/dashboard/members/${member.id}`}>
                <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/30">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={member.avatarUrl} />
                          <AvatarFallback className="bg-primary/10 text-primary font-medium">
                            {member.name.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        {/* Standing dot */}
                        <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${standing.dotColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold group-hover:text-primary transition-colors">
                            {member.name}
                          </p>
                          {RoleIcon && <RoleIcon className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        </div>
                        {member.position && (
                          <p className="text-xs font-medium text-primary">{member.position}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${standing.color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${standing.dotColor}`} />
                            {t(`members.standing${member.standing.charAt(0).toUpperCase() + member.standing.slice(1)}` as "members.standingGood")}
                          </span>
                          {member.isProxy && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {t("members.proxy")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {member.isProxy && member.proxyManager && (
                      <p className="mt-2 text-[11px] text-muted-foreground pl-[60px]">
                        {t("members.proxyManagedBy", { name: member.proxyManager })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
