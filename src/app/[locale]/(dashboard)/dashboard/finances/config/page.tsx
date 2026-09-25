"use client";

import { useTranslations } from "next-intl";
import { RequirePermission } from "@/components/ui/permission-gate";
import { BackButton } from "@/components/ui/back-button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AccountsTab } from "@/components/finances/config/accounts-tab";
import { FundsTab } from "@/components/finances/config/funds-tab";
import { CategoriesTab } from "@/components/finances/config/categories-tab";
import { Landmark, Coins, Tags } from "lucide-react";

export default function FinancialConfigPage() {
  const t = useTranslations("financialConfig");

  return (
    <RequirePermission permission="finances.manage">
      <div className="space-y-6">
        <div>
          <BackButton href="/dashboard/finances" />
        </div>

        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
            <TabsTrigger value="accounts" className="gap-2">
              <Landmark className="h-4 w-4" />
              <span>{t("tabs.accounts")}</span>
            </TabsTrigger>
            <TabsTrigger value="funds" className="gap-2">
              <Coins className="h-4 w-4" />
              <span>{t("tabs.funds")}</span>
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-2">
              <Tags className="h-4 w-4" />
              <span>{t("tabs.categories")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="mt-4">
            <AccountsTab />
          </TabsContent>
          <TabsContent value="funds" className="mt-4">
            <FundsTab />
          </TabsContent>
          <TabsContent value="categories" className="mt-4">
            <CategoriesTab />
          </TabsContent>
        </Tabs>
      </div>
    </RequirePermission>
  );
}
