"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import { LogOut, User, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGroup } from "@/lib/group-context";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function UserMenu() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useGroup();

  const displayName = user?.full_name || user?.display_name || "User";
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    queryClient.removeQueries();
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="shrink-0 focus:outline-none">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={user?.avatar_url || undefined} alt={displayName} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{displayName}</p>
          <p className="text-xs text-muted-foreground">{user?.phone || ""}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex items-center gap-2"
          onClick={() => router.push("/dashboard/my-profile")}
        >
          <User className="h-4 w-4" />
          {t("header.profile")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center gap-2"
          onClick={() => router.push("/dashboard/settings")}
        >
          <Settings className="h-4 w-4" />
          {t("header.settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex items-center gap-2 text-destructive" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          {t("auth.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
