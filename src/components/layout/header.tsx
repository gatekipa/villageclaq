"use client";

import { useTranslations } from "next-intl";
import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GroupSwitcher } from "./group-switcher";
import { LanguageToggle } from "./language-toggle";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const t = useTranslations("header");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Group Switcher */}
      <GroupSwitcher />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />

        {/* Notification bell */}
        <Button variant="ghost" size="icon" title={t("notifications")}>
          <div className="relative">
            <Bell className="h-5 w-5" />
            <Badge className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full p-0 text-[10px] flex items-center justify-center">
              3
            </Badge>
          </div>
        </Button>

        {/* User avatar */}
        <UserMenu />
      </div>
    </header>
  );
}
