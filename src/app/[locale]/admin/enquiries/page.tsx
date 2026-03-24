"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Mail,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

type EnquiryStatus = "new" | "in_progress" | "resolved";

interface Enquiry {
  id: string;
  name: string;
  email: string;
  subject: string;
  created_at: string;
  status: EnquiryStatus;
  message: string;
  reply: string | null;
  assigned_to: string | null;
}

const statusColors: Record<EnquiryStatus, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const statusKeys: Record<EnquiryStatus, string> = {
  new: "statusNew",
  in_progress: "statusInProgress",
  resolved: "statusResolved",
};

export default function EnquiriesPage() {
  const t = useTranslations("admin");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [statusChanges, setStatusChanges] = useState<Record<string, EnquiryStatus>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchEnquiries = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("contact_enquiries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setEnquiries(data || []);
    } catch (err) {
      console.error("Error fetching enquiries:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnquiries();
  }, [fetchEnquiries]);

  const handleUpdateEnquiry = async (id: string) => {
    const supabase = createClient();
    setSaving(id);
    try {
      const updates: Record<string, unknown> = {};
      if (replyTexts[id] !== undefined && replyTexts[id].trim()) {
        updates.reply = replyTexts[id].trim();
      }
      if (statusChanges[id]) {
        updates.status = statusChanges[id];
      }
      if (Object.keys(updates).length === 0) return;

      const { error } = await supabase
        .from("contact_enquiries")
        .update(updates)
        .eq("id", id);
      if (error) throw error;

      // Update local state
      setEnquiries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                ...(updates.reply ? { reply: updates.reply as string } : {}),
                ...(updates.status ? { status: updates.status as EnquiryStatus } : {}),
              }
            : e
        )
      );
      setReplyTexts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setStatusChanges((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      console.error("Error updating enquiry:", err);
    } finally {
      setSaving(null);
    }
  };

  const filtered =
    statusFilter === "all"
      ? enquiries
      : enquiries.filter((e) => e.status === statusFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("enquiries")}</h1>
        <p className="text-sm text-muted-foreground">{t("enquiriesSubtitle")}</p>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {["all", "new", "in_progress", "resolved"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status === "all" ? t("allStatuses") : t(statusKeys[status as EnquiryStatus])}
          </Button>
        ))}
      </div>

      {/* Enquiry List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
              {t("noEnquiries")}
            </CardContent>
          </Card>
        )}

        {filtered.map((enquiry) => {
          const isExpanded = expandedId === enquiry.id;
          const displayDate = enquiry.created_at
            ? new Date(enquiry.created_at).toISOString().split("T")[0]
            : "";
          return (
            <Card key={enquiry.id}>
              <CardContent className="p-4">
                {/* Summary row */}
                <button
                  type="button"
                  className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
                  onClick={() => setExpandedId(isExpanded ? null : enquiry.id)}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                      <Mail className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{enquiry.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {enquiry.name} &middot; {enquiry.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-12 sm:pl-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {displayDate}
                    </div>
                    <Badge className={statusColors[enquiry.status]}>
                      {t(statusKeys[enquiry.status])}
                    </Badge>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("fullMessage")}
                      </Label>
                      <p className="mt-1 text-sm leading-relaxed">
                        {enquiry.message}
                      </p>
                    </div>

                    {enquiry.reply && (
                      <div>
                        <Label className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          {t("reply")}
                        </Label>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {enquiry.reply}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>{t("reply")}</Label>
                      <Textarea
                        rows={3}
                        placeholder={t("replyPlaceholder")}
                        value={replyTexts[enquiry.id] || ""}
                        onChange={(e) =>
                          setReplyTexts((prev) => ({
                            ...prev,
                            [enquiry.id]: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">{t("changeStatus")}</Label>
                        <Select
                          value={statusChanges[enquiry.id] || enquiry.status}
                          onValueChange={(val) =>
                            setStatusChanges((prev) => ({
                              ...prev,
                              [enquiry.id]: val as EnquiryStatus,
                            }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">{t("statusNew")}</SelectItem>
                            <SelectItem value="in_progress">{t("statusInProgress")}</SelectItem>
                            <SelectItem value="resolved">{t("statusResolved")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleUpdateEnquiry(enquiry.id)}
                        disabled={saving === enquiry.id}
                      >
                        {saving === enquiry.id && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t("reply")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
