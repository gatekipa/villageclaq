"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";

/** The route's group is the action boundary. Aggregate views name their scope separately. */
export function HierarchyScopeBar() {
  const t = useTranslations("hierarchyContext");
  const { currentGroup, groupId } = useGroup();
  const { data: hierarchy } = useQuery({
    queryKey: ["hierarchy-context", currentGroup?.organization_id, groupId],
    enabled: !!currentGroup?.organization_id && !!groupId,
    queryFn: async () => {
      const { data, error } = await createClient().from("organization_units")
        .select("id,name,group_id,parent_id")
        .eq("organization_id", currentGroup!.organization_id!);
      if (error) throw error;
      return {
        organization: data?.find((unit) => unit.parent_id === null)?.name || "",
        unit: data?.find((unit) => unit.group_id === groupId)?.name || "",
      };
    },
  });

  if (!currentGroup || !groupId) return null;
  return (
    <div className="border-b bg-muted/40 px-4 py-1 text-xs text-muted-foreground lg:px-6"
      aria-label={t("contextLabel")}>
      <span className="inline-block mr-3">
        {t("organization")}: <strong className="text-foreground">
          {hierarchy?.organization || currentGroup.name}
        </strong>
      </span>
      <span className="inline-block mr-3">
        {t("operatingUnit")}: <strong className="text-foreground">
          {hierarchy?.unit || currentGroup.name}
        </strong>
      </span>
      <span className="inline-block mr-3">
        {t("viewScope")}: <strong className="text-foreground">{t("thisGroup")}</strong>
      </span>
      <span className="inline-block">
        {t("actionScope")}: <strong className="text-foreground">{t("thisGroup")}</strong>
      </span>
    </div>
  );
}
