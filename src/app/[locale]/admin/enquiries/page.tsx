"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Mail,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
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

type EnquiryStatus = "new" | "in_progress" | "resolved";

interface Enquiry {
  id: string;
  name: string;
  email: string;
  subject: string;
  date: string;
  status: EnquiryStatus;
  message: string;
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

const mockEnquiries: Enquiry[] = [
  {
    id: "1",
    name: "Pierre Kamga",
    email: "pierre.kamga@gmail.com",
    subject: "Unable to create a new group",
    date: "2026-03-23",
    status: "new",
    message: "I signed up yesterday and when I try to create a new group, I get an error message saying 'Something went wrong'. I have tried multiple browsers but the issue persists. Please help.",
  },
  {
    id: "2",
    name: "Aisha Bello",
    email: "aisha.bello@yahoo.com",
    subject: "Question about Enterprise pricing",
    date: "2026-03-22",
    status: "in_progress",
    message: "We are a large alumni association with over 500 members. We would like to know more about the Enterprise plan and whether you offer custom pricing for organizations of our size.",
  },
  {
    id: "3",
    name: "Jean-Paul Mbarga",
    email: "jpmbarga@outlook.com",
    subject: "Feature request: SMS notifications",
    date: "2026-03-21",
    status: "new",
    message: "Many of our members in rural areas do not have reliable internet. It would be great if VillageClaq could send SMS reminders for contribution deadlines and meeting announcements.",
  },
  {
    id: "4",
    name: "Comfort Adeola",
    email: "comfort.adeola@gmail.com",
    subject: "Payment not reflecting in dashboard",
    date: "2026-03-20",
    status: "resolved",
    message: "I made a Mobile Money payment of 15,000 FCFA on March 18th but it still does not show up in our group dashboard. The transaction reference is MM20260318-4521.",
  },
  {
    id: "5",
    name: "Bertrand Njoh",
    email: "bertrand.njoh@gmail.com",
    subject: "How to export member list?",
    date: "2026-03-19",
    status: "resolved",
    message: "I am the secretary of our village development union. How can I export the full member list with phone numbers and email addresses to an Excel file?",
  },
  {
    id: "6",
    name: "Fatou Diallo",
    email: "fatou.diallo@hotmail.com",
    subject: "Bug: Calendar events showing wrong time",
    date: "2026-03-18",
    status: "in_progress",
    message: "Events scheduled in the WAT timezone are displaying one hour early for all members. This started happening after the last update. It is causing confusion for our weekly meeting schedule.",
  },
];

const staffMembers = [
  "Jude Anyere",
  "Marie Nguemo",
  "Samuel Fon",
  "Grace Tabi",
  "Emmanuel Nkeng",
];

export default function EnquiriesPage() {
  const t = useTranslations("admin");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = statusFilter === "all"
    ? mockEnquiries
    : mockEnquiries.filter((e) => e.status === statusFilter);

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
                      {enquiry.date}
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

                    <div className="space-y-2">
                      <Label>{t("reply")}</Label>
                      <Textarea
                        rows={3}
                        placeholder={t("replyPlaceholder")}
                      />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">{t("changeStatus")}</Label>
                        <Select defaultValue={enquiry.status}>
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
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">{t("assignTo")}</Label>
                        <Select>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t("assignTo")} />
                          </SelectTrigger>
                          <SelectContent>
                            {staffMembers.map((name) => (
                              <SelectItem key={name} value={name}>
                                <span className="flex items-center gap-2">
                                  <User className="h-3 w-3" />
                                  {name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button size="sm">{t("reply")}</Button>
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
