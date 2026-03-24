"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Globe,
  Shield,
  Users,
  Settings2,
} from "lucide-react";
import { useGroupSettings, useGroupPositions } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { AdminGuard } from "@/components/ui/admin-guard";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function GroupSettingsPage() {
  const t = useTranslations("settings");
  const { isAdmin } = useGroup();
  const { data: group, isLoading: groupLoading, isError: groupError, error: groupErr, refetch: refetchGroup } = useGroupSettings();
  const { data: positions, isLoading: posLoading, isError: posError, error: posErr, refetch: refetchPos } = useGroupPositions();

  const isLoading = groupLoading || posLoading;
  const isError = groupError || posError;

  if (isLoading) {
    return <AdminGuard><ListSkeleton rows={5} /></AdminGuard>;
  }

  if (isError) {
    return (
      <AdminGuard><ErrorState
        message={(groupErr as Error)?.message || (posErr as Error)?.message}
        onRetry={() => {
          refetchGroup();
          refetchPos();
        }}
      /></AdminGuard>
    );
  }

  const groupData = group as Record<string, unknown> | null;
  const positionsData = (positions || []) as Record<string, unknown>[];

  return (
    <AdminGuard><div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="info">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="info">{t("profileTab")}</TabsTrigger>
          <TabsTrigger value="localization">{t("localizationTab")}</TabsTrigger>
          <TabsTrigger value="positions">{t("positionsTab")}</TabsTrigger>
        </TabsList>

        {/* Group Info Tab */}
        <TabsContent value="info" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4" />
                {t("groupInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {groupData ? (
                <div className="space-y-4">
                  {/* Logo + Name */}
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                      {groupData.logo_url ? (
                        <img
                          src={groupData.logo_url as string}
                          alt=""
                          className="h-16 w-16 rounded-2xl object-cover"
                        />
                      ) : (
                        getInitials((groupData.name as string) || "G")
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{groupData.name as string}</h3>
                      <p className="text-sm text-muted-foreground">{(groupData.group_type as string) || "general"}</p>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("groupType")}</p>
                      <p className="mt-1 text-sm font-medium capitalize">{(groupData.group_type as string) || "—"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("currency")}</p>
                      <p className="mt-1 text-sm font-medium">{(groupData.currency as string) || "—"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("defaultLocale")}</p>
                      <p className="mt-1 text-sm font-medium">{(groupData.locale as string) || "—"}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("status")}</p>
                      <p className="mt-1 text-sm font-medium">{(groupData.is_active as boolean) ? "Active" : "Inactive"}</p>
                    </div>
                  </div>

                  {/* Description */}
                  {(groupData.description as string) ? (
                    <div className="rounded-lg border p-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("groupDescription")}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{groupData.description as string}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Localization Tab */}
        <TabsContent value="localization" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" />
                {t("localizationTab")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {groupData ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">{t("defaultLocale")}</p>
                    <p className="mt-1 text-sm font-medium">
                      {(groupData.locale as string) === "fr" ? "Francais" : "English"}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">{t("currency")}</p>
                    <p className="mt-1 text-sm font-medium">{(groupData.currency as string) || "—"}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">{t("timezone")}</p>
                    <p className="mt-1 text-sm font-medium">{(groupData.timezone as string) || "—"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Positions Tab */}
        <TabsContent value="positions" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                {t("positions")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {positionsData.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title={t("noPositions")}
                  description={t("noPositionsDesc")}
                />
              ) : (
                <div className="space-y-3">
                  {positionsData.map((pos) => {
                    const posId = pos.id as string;
                    const posName = (pos.name as string) || "—";
                    const posNameFr = pos.name_fr as string | null;
                    const assignments = (pos.position_assignments || []) as Record<string, unknown>[];

                    // Get current holders (active assignments)
                    const activeHolders = assignments.filter((a) => {
                      const endDate = a.ended_at as string | null;
                      return !endDate || new Date(endDate) > new Date();
                    });

                    return (
                      <div key={posId} className="rounded-lg border p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h4 className="font-medium text-sm">{posName}</h4>
                            {posNameFr && (
                              <p className="text-xs text-muted-foreground">{posNameFr}</p>
                            )}
                          </div>
                          {activeHolders.length === 0 ? (
                            <Badge variant="secondary">{t("vacant")}</Badge>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {activeHolders.map((holder, i) => {
                                const membership = holder.membership as Record<string, unknown> | undefined;
                                const profiles = membership?.profiles;
                                const profile = (
                                  Array.isArray(profiles) ? profiles[0] : profiles
                                ) as { full_name?: string; avatar_url?: string } | null;
                                const holderName = profile?.full_name || "—";

                                return (
                                  <div key={i} className="flex items-center gap-2">
                                    <Avatar className="h-7 w-7">
                                      {profile?.avatar_url && (
                                        <AvatarImage src={profile.avatar_url} alt={holderName} />
                                      )}
                                      <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                                        {getInitials(holderName)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm">{holderName}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div></AdminGuard>
  );
}
