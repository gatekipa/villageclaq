"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  const t = useTranslations("errors");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* VC Logo */}
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white shadow-lg">
        VC
      </div>

      {/* 404 */}
      <h1 className="text-[8rem] font-extrabold leading-none tracking-tighter text-muted-foreground/30 sm:text-[10rem]">
        404
      </h1>

      {/* Title */}
      <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
        {t("notFoundTitle")}
      </h2>

      {/* Description */}
      <p className="mt-3 max-w-md text-center text-muted-foreground">
        {t("notFoundDesc")}
      </p>

      {/* Search input */}
      <div className="relative mt-8 w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t("notFoundSearch")}
          className="pl-10"
        />
      </div>

      {/* Go to Dashboard */}
      <Link href="/dashboard">
        <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700">
          <LayoutDashboard className="mr-2 h-4 w-4" />
          {t("goHome")}
        </Button>
      </Link>
    </div>
  );
}
