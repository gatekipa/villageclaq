"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Users,
  MapPin,
  Mail,
  Phone,
  Calendar,
  Star,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface DirectoryMember {
  id: string;
  name: string;
  position: "president" | "treasurer" | "secretary" | "member";
  location: string;
  joinedAt: string;
  showEmail: boolean;
  showPhone: boolean;
  email?: string;
  phone?: string;
  bio?: string;
}

const today = new Date();
const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(today.getDate() - 7);

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

const mockMembers: DirectoryMember[] = [
  {
    id: "1",
    name: "Cyril Ndonwi",
    position: "president",
    location: "Bamenda, NW",
    joinedAt: "2024-01-15",
    showEmail: true,
    showPhone: true,
    email: "cyril.ndonwi@email.com",
    phone: "+237 677 123 456",
    bio: "Community leader passionate about cultural heritage preservation and youth empowerment in the Northwest Region.",
  },
  {
    id: "2",
    name: "Sylvie Mbarga",
    position: "treasurer",
    location: "Yaound\u00e9, CE",
    joinedAt: "2024-02-01",
    showEmail: true,
    showPhone: false,
    email: "sylvie.mbarga@email.com",
    bio: "Accountant by profession. Committed to transparent financial management for our community.",
  },
  {
    id: "3",
    name: "Emmanuel Tabi",
    position: "secretary",
    location: "Douala, LT",
    joinedAt: "2024-02-10",
    showEmail: false,
    showPhone: true,
    phone: "+237 699 456 789",
    bio: "Keeping accurate records and ensuring seamless communication across our membership.",
  },
  {
    id: "4",
    name: "Marie-Claire Fotso",
    position: "member",
    location: "Bafoussam, WE",
    joinedAt: "2024-03-05",
    showEmail: true,
    showPhone: true,
    email: "mc.fotso@email.com",
    phone: "+237 655 321 987",
  },
  {
    id: "5",
    name: "Jean-Pierre Kamga",
    position: "member",
    location: "Douala, LT",
    joinedAt: "2024-03-20",
    showEmail: false,
    showPhone: false,
  },
  {
    id: "6",
    name: "Beatrice Ngono",
    position: "member",
    location: "Yaound\u00e9, CE",
    joinedAt: "2024-04-01",
    showEmail: true,
    showPhone: false,
    email: "beatrice.ngono@email.com",
    bio: "Teacher and mother of three. Proud to be part of this community.",
  },
  {
    id: "7",
    name: "Patrick Njoya",
    position: "member",
    location: "Foumban, WE",
    joinedAt: "2024-05-15",
    showEmail: false,
    showPhone: true,
    phone: "+237 670 111 222",
  },
  {
    id: "8",
    name: "Angeline Tchatchouang",
    position: "member",
    location: "Dschang, WE",
    joinedAt: "2024-06-10",
    showEmail: true,
    showPhone: true,
    email: "angeline.t@email.com",
    phone: "+237 691 777 888",
    bio: "Agricultural engineer working to modernize farming practices in our village.",
  },
  {
    id: "9",
    name: "Samuel Fon",
    position: "member",
    location: "Limb\u00e9, SW",
    joinedAt: "2024-07-01",
    showEmail: false,
    showPhone: false,
  },
  {
    id: "10",
    name: "Grace Eteki",
    position: "member",
    location: "Buea, SW",
    joinedAt: "2024-08-20",
    showEmail: true,
    showPhone: false,
    email: "grace.eteki@email.com",
  },
  {
    id: "11",
    name: "Fran\u00e7ois Nkeng",
    position: "member",
    location: "Bamenda, NW",
    joinedAt: daysAgoISO(3),
    showEmail: true,
    showPhone: true,
    email: "francois.nkeng@email.com",
    phone: "+237 680 444 555",
    bio: "Recently moved back from abroad. Excited to reconnect with the community.",
  },
  {
    id: "12",
    name: "Isabelle Kom",
    position: "member",
    location: "Yaound\u00e9, CE",
    joinedAt: daysAgoISO(5),
    showEmail: false,
    showPhone: true,
    phone: "+237 654 999 000",
  },
];

const positionBadgeStyles: Record<string, string> = {
  president:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  treasurer:
    "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  secretary:
    "bg-purple-500/10 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
  member:
    "bg-gray-500/10 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
};

const avatarGradients: string[] = [
  "from-emerald-500 to-teal-600",
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-red-600",
  "from-cyan-500 to-blue-600",
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function isNewMember(joinedAt: string): boolean {
  const joined = new Date(joinedAt);
  return joined >= sevenDaysAgo;
}

function getGradient(id: string): string {
  const index = parseInt(id, 10) % avatarGradients.length;
  return avatarGradients[index];
}

const filterPositions = [
  "all",
  "president",
  "treasurer",
  "secretary",
  "member",
] as const;

export default function DirectoryPage() {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const filtered = mockMembers.filter((m) => {
    const matchesSearch = m.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesRole =
      roleFilter === "all" || m.position === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("directory.title")}
        </h1>
        <p className="text-muted-foreground">{t("directory.subtitle")}</p>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("directory.searchMembers")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {filterPositions.map((pos) => (
            <option key={pos} value={pos}>
              {pos === "all"
                ? t("directory.allRoles")
                : t(`roles.${pos}`)}
            </option>
          ))}
        </select>
        <Badge variant="secondary" className="w-fit">
          <Users className="mr-1 h-3 w-3" />
          {t("directory.membersCount", { count: filtered.length })}
        </Badge>
      </div>

      {/* Member Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {t("directory.noResults")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("directory.noResultsDesc")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((member) => {
            const isExpanded = selectedMemberId === member.id;
            const isNew = isNewMember(member.joinedAt);
            const gradient = getGradient(member.id);

            return (
              <Card
                key={member.id}
                className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/30 ${
                  isExpanded ? "ring-2 ring-primary/20" : ""
                }`}
                onClick={() =>
                  setSelectedMemberId(isExpanded ? null : member.id)
                }
              >
                <CardContent className="p-4">
                  {/* Top section: avatar + name + position */}
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarFallback
                        className={`bg-gradient-to-br ${gradient} text-white font-semibold text-sm`}
                      >
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {member.name}
                        </p>
                        {isNew && (
                          <Badge className="bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-0 text-[10px] px-1.5 py-0 shrink-0">
                            <Star className="mr-0.5 h-2.5 w-2.5" />
                            {t("directory.newMember")}
                          </Badge>
                        )}
                      </div>
                      <Badge
                        className={`mt-1 border-0 text-[11px] px-2 py-0.5 ${
                          positionBadgeStyles[member.position]
                        }`}
                      >
                        {t(`roles.${member.position}`)}
                      </Badge>
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{member.location}</span>
                      </div>
                    </div>
                    {/* Privacy-aware contact icons */}
                    <div className="flex flex-col gap-1 shrink-0">
                      {member.showEmail && (
                        <div className="rounded-md bg-muted p-1.5">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                      {member.showPhone && (
                        <div className="rounded-md bg-muted p-1.5">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expand/collapse indicator */}
                  <div className="mt-3 flex items-center justify-center">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Expanded detail section */}
                  {isExpanded && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      {/* Member since */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {t("directory.memberSince", {
                            date: new Date(
                              member.joinedAt
                            ).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            }),
                          })}
                        </span>
                      </div>

                      {/* Contact info */}
                      {(member.showEmail || member.showPhone) && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            {t("directory.contactInfo")}
                          </p>
                          {member.showEmail && member.email && (
                            <div className="flex items-center gap-2 text-xs">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{member.email}</span>
                            </div>
                          )}
                          {member.showPhone && member.phone && (
                            <div className="flex items-center gap-2 text-xs">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span>{member.phone}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bio */}
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">
                          {t("directory.bio")}
                        </p>
                        <p className="text-xs leading-relaxed text-foreground/80">
                          {member.bio || t("directory.noBio")}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
