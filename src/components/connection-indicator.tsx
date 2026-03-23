"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "online" | "pending" | "offline";

export function ConnectionIndicator() {
  const t = useTranslations("pwa");
  const [status, setStatus] = useState<Status>("online");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateStatus = () => {
      if (!navigator.onLine) {
        setStatus("offline");
      } else if (pendingCount > 0) {
        setStatus("pending");
      } else {
        setStatus("online");
      }
    };

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    updateStatus();

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, [pendingCount]);

  const config = {
    online: {
      icon: Wifi,
      color: "text-emerald-500",
      bg: "bg-emerald-500",
      label: t("connectionOnline"),
    },
    pending: {
      icon: RefreshCw,
      color: "text-amber-500",
      bg: "bg-amber-500",
      label: t("connectionPending", { count: pendingCount }),
    },
    offline: {
      icon: WifiOff,
      color: "text-red-500",
      bg: "bg-red-500",
      label: t("connectionOffline"),
    },
  };

  const { icon: Icon, color, bg, label } = config[status];

  // Only show when not online
  if (status === "online") return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
      <div className={cn("h-2 w-2 rounded-full", bg)} />
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
