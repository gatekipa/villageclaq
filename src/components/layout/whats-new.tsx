"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, CheckCircle2, Rocket, Wrench, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { changelog, getLatestVersion } from "@/lib/changelog";
import type { ChangelogEntry } from "@/lib/changelog";

const STORAGE_KEY = "villageclaq-last-seen-changelog";

function getCategoryIcon(category: ChangelogEntry["category"]) {
  switch (category) {
    case "feature":
      return Rocket;
    case "improvement":
      return Wrench;
    case "bugfix":
      return Bug;
  }
}

function getCategoryColor(category: ChangelogEntry["category"]) {
  switch (category) {
    case "feature":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    case "improvement":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "bugfix":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
  }
}

export function WhatsNew() {
  const t = useTranslations("changelog");
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    const latest = getLatestVersion();
    if (lastSeen !== latest) {
      setHasNew(true);
    }
  }, []);

  function handleGotIt() {
    localStorage.setItem(STORAGE_KEY, getLatestVersion());
    setHasNew(false);
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title={t("whatsNew")}
        className="relative"
      >
        <Sparkles className="h-5 w-5" />
        {hasNew && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              {t("whatsNew")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {changelog.map((entry) => {
              const CategoryIcon = getCategoryIcon(entry.category);
              return (
                <div key={entry.version} className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="font-mono text-xs"
                    >
                      v{entry.version}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={getCategoryColor(entry.category)}
                    >
                      <CategoryIcon className="mr-1 h-3 w-3" />
                      {t("newBadge")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {entry.date}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">
                      {t(entry.titleKey.replace("changelog.", ""))}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(entry.descriptionKey.replace("changelog.", ""))}
                    </p>
                  </div>

                  <ul className="space-y-1.5">
                    {entry.features.map((featureKey) => (
                      <li
                        key={featureKey}
                        className="flex items-start gap-2 text-sm"
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{t(featureKey.replace("changelog.", ""))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button onClick={handleGotIt} className="w-full sm:w-auto">
              {t("gotIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
