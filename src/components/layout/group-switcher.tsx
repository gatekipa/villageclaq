"use client";

import { useTranslations } from "next-intl";
import { ChevronsUpDown, Plus } from "lucide-react";
import { Link } from "@/i18n/routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGroup } from "@/lib/group-context";

export function GroupSwitcher() {
  const t = useTranslations("groups");
  const { memberships, currentGroup, switchGroup } = useGroup();

  if (!currentGroup) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 max-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground focus:outline-none">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
          {currentGroup.name.charAt(0)}
        </div>
        <span className="truncate text-sm">{currentGroup.name}</span>
        <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[240px]">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {t("allGroups")}
        </div>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.id}
            className="flex items-center gap-2"
            onClick={() => switchGroup(m.group_id)}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
              {m.group.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-sm">{m.group.name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {m.role}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex items-center gap-2"
          onClick={() => window.location.href = "/dashboard/onboarding/group"}
        >
          <Plus className="h-4 w-4" />
          <span>{t("manageGroups")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
