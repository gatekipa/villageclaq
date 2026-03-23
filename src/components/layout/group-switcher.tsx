"use client";

import { useTranslations } from "next-intl";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// TODO: Replace with real data from memberships query
const mockGroups = [
  { id: "1", name: "Bamenda Alumni Union", role: "President" },
  { id: "2", name: "Njangi Group #5", role: "Member" },
];

export function GroupSwitcher() {
  const t = useTranslations("groups");
  const currentGroup = mockGroups[0]; // TODO: use state/context

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
        {mockGroups.map((group) => (
          <DropdownMenuItem key={group.id} className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
              {group.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-sm">{group.name}</span>
              <span className="text-xs text-muted-foreground">
                {group.role}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          <span>{t("manageGroups")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
