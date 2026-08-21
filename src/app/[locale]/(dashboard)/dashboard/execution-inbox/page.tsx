"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1A — HITL (human-in-the-loop) Execution Inbox, REVIEW-ONLY SHELL.
//
// This page reads the action_intents ledger and renders it for a human. It
// deliberately contains NO mutation path of any kind: no supabase.rpc(), no
// .insert()/.update()/.delete(), no fetch() to any API route, and no import
// of any notification producer or send helper. The Approve/Reject controls are
// rendered disabled so the eventual layout is real, but they are not wired to
// anything — approving is Phase 1B and ships with its own reviewed backend.
//
// The action_intents table is CREATE-NOT-APPLY (migration 00113), so in every
// currently deployed environment the query below fails with Postgres 42P01
// (undefined_table). That is an expected state, not an error: it renders the
// "not enabled yet" panel instead of an error banner.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Inbox, ShieldAlert, Sparkles, Lock } from "lucide-react";
import { useGroup } from "@/lib/group-context";
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { RequirePermission } from "@/components/ui/permission-gate";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";
import { getMemberName } from "@/lib/get-member-name";
import { formatDateWithGroupFormat } from "@/lib/format";

/** Permission set for both this page and its sidebar entry — keep them equal. */
const INBOX_PERMISSIONS = ["finances.view", "finances.manage", "settings.manage"];

/** Postgres undefined_table — the ledger migration has not been applied here. */
const UNDEFINED_TABLE = "42P01";

type ActionIntent = {
  id: string;
  group_id: string;
  target_member_id: string | null;
  trigger_context: Record<string, unknown> | null;
  proposed_action: string;
  action_payload: Record<string, unknown> | null;
  confidence_score: number | null;
  status: string;
  priority: string;
  source: string;
  created_at: string;
};

type IntentQueryResult = { notEnabled: boolean; intents: ActionIntent[] };

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  rejected: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  executed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  cancelled: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  normal: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

/** snake_case enum -> the camelCase i18n key suffix, e.g. payment_reminder -> PaymentReminder */
function pascal(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// ─── HOOKS ───────────────────────────────────────────────────────────────────

/**
 * Read-only ledger fetch. Returns `notEnabled` rather than throwing when the
 * table is absent, so an un-provisioned environment renders an explanatory
 * panel instead of an error state.
 */
function useActionIntents(groupId: string | null | undefined) {
  return useQuery<IntentQueryResult>({
    queryKey: ["action-intents", groupId],
    queryFn: async () => {
      if (!groupId) return { notEnabled: false, intents: [] };
      const supabase = createClient();
      const { data, error } = await supabase
        .from("action_intents")
        .select(
          "id, group_id, target_member_id, trigger_context, proposed_action, action_payload, confidence_score, status, priority, source, created_at",
        )
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        if (error.code === UNDEFINED_TABLE) {
          return { notEnabled: true, intents: [] };
        }
        throw error;
      }
      return { notEnabled: false, intents: (data || []) as ActionIntent[] };
    },
    enabled: !!groupId,
    staleTime: 60_000,
  });
}

// ─── PAGE ────────────────────────────────────────────────────────────────────

export default function ExecutionInboxPage() {
  return (
    <RequirePermission anyOf={INBOX_PERMISSIONS}>
      <ExecutionInboxContent />
    </RequirePermission>
  );
}

function ExecutionInboxContent() {
  const t = useTranslations("executionInbox");
  const locale = useLocale();
  const { groupId, currentGroup } = useGroup();
  const { data: members } = useMembers();
  const { data, isLoading, isError, error, refetch } = useActionIntents(groupId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const groupDateFormat =
    ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const fd = (value: string | null | undefined) =>
    value ? formatDateWithGroupFormat(value, groupDateFormat, locale) : "—";

  const intents = useMemo(() => data?.intents ?? [], [data]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of (members || []) as Record<string, unknown>[]) {
      map.set(m.id as string, getMemberName(m));
    }
    return map;
  }, [members]);

  const selected = useMemo(
    () => intents.find((i) => i.id === selectedId) ?? null,
    [intents, selectedId],
  );

  // Keyboard foundation: Up/Down move the selection within the list. Read-only —
  // no key is bound to any decision, so a stray keypress can never act.
  const onListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (intents.length === 0) return;
      event.preventDefault();
      const current = intents.findIndex((i) => i.id === selectedId);
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        current === -1
          ? 0
          : Math.min(intents.length - 1, Math.max(0, current + delta));
      setSelectedId(intents[nextIndex].id);
    },
    [intents, selectedId],
  );

  if (isLoading) return <ListSkeleton rows={6} />;
  if (isError) {
    return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      {/* Standing notice: this surface cannot act. */}
      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20">
        <CardContent className="flex gap-3 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-900 dark:text-amber-300">
              {t("previewBannerTitle")}
            </p>
            <p className="text-sm text-amber-900/80 dark:text-amber-300/80">
              {t("previewBannerBody")}
            </p>
          </div>
        </CardContent>
      </Card>

      {data?.notEnabled ? (
        <EmptyState
          icon={Sparkles}
          title={t("notEnabledTitle")}
          description={t("notEnabledBody")}
        />
      ) : intents.length === 0 ? (
        <EmptyState icon={Inbox} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          {/* List */}
          <Card className="overflow-hidden">
            <div
              ref={listRef}
              tabIndex={0}
              onKeyDown={onListKeyDown}
              className="max-h-[32rem] overflow-y-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("listHeading")}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead>{t("colAction")}</TableHead>
                    <TableHead>{t("colMember")}</TableHead>
                    <TableHead>{t("colPriority")}</TableHead>
                    <TableHead className="text-right">{t("colConfidence")}</TableHead>
                    <TableHead>{t("colCreated")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intents.map((intent) => (
                    <TableRow
                      key={intent.id}
                      onClick={() => setSelectedId(intent.id)}
                      aria-selected={intent.id === selectedId}
                      className={`cursor-pointer ${
                        intent.id === selectedId ? "bg-muted/60" : ""
                      }`}
                    >
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={STATUS_STYLES[intent.status] || STATUS_STYLES.pending}
                        >
                          {t(`status${pascal(intent.status)}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {t(`action${pascal(intent.proposed_action)}`)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {intent.target_member_id
                          ? memberNameById.get(intent.target_member_id) || t("noMember")
                          : t("noMember")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={PRIORITY_STYLES[intent.priority] || PRIORITY_STYLES.normal}
                        >
                          {t(`priority${pascal(intent.priority)}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {intent.confidence_score === null
                          ? t("noConfidence")
                          : `${Math.round(intent.confidence_score * 100)}%`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {fd(intent.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Detail panel */}
          <Card>
            <CardContent className="space-y-4 p-4">
              <h2 className="text-lg font-semibold">{t("detailHeading")}</h2>
              {!selected ? (
                <p className="text-sm text-muted-foreground">{t("selectPrompt")}</p>
              ) : (
                <>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t("colAction")}</dt>
                      <dd className="font-medium">
                        {t(`action${pascal(selected.proposed_action)}`)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t("colMember")}</dt>
                      <dd>
                        {selected.target_member_id
                          ? memberNameById.get(selected.target_member_id) || t("noMember")
                          : t("noMember")}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t("colSource")}</dt>
                      <dd className="font-mono text-xs">{selected.source}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">{t("colCreated")}</dt>
                      <dd>{fd(selected.created_at)}</dd>
                    </div>
                  </dl>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("triggerContext")}
                    </p>
                    <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
                      {JSON.stringify(selected.trigger_context ?? {}, null, 2)}
                    </pre>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("actionPayload")}
                    </p>
                    <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">
                      {JSON.stringify(selected.action_payload ?? {}, null, 2)}
                    </pre>
                  </div>

                  {/* Layout placeholders only. Intentionally inert: no onClick,
                      permanently disabled until Phase 1B ships approval. */}
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex gap-2">
                      <Button size="sm" disabled aria-disabled="true">
                        {t("approve")}
                      </Button>
                      <Button size="sm" variant="outline" disabled aria-disabled="true">
                        {t("reject")}
                      </Button>
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      {t("decisionsDisabled")}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
