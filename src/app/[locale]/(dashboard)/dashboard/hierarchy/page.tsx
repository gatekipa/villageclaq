"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Unit = { id: string; name: string; group_id: string | null;
  parent_id: string | null; archived_at: string | null };
type Grant = { unit_id: string; user_id: string; display_name: string;
  capability: string; scope_mode: string };
type Person = { person_id: string; user_id: string;
  display_name: string; verified_at: string | null; active_memberships: number };

export default function HierarchyPage() {
  const t = useTranslations("hierarchyManage");
  const { currentGroup, groupId } = useGroup();
  const organizationId = currentGroup?.organization_id;
  const queryClient = useQueryClient();
  const [parentId, setParentId] = useState("");
  const [newName, setNewName] = useState("");
  const [moveUnitId, setMoveUnitId] = useState("");
  const [moveParentId, setMoveParentId] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [archiveUnitId, setArchiveUnitId] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [grantUnitId, setGrantUnitId] = useState("");
  const [grantUserId, setGrantUserId] = useState("");
  const [grantCapability, setGrantCapability] = useState("hierarchy.manage");
  const [grantMode, setGrantMode] = useState("unit");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const unitsQuery = useQuery({
    queryKey: ["hierarchy-units", organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await createClient().from("organization_units")
        .select("id,name,group_id,parent_id,archived_at")
        .eq("organization_id", organizationId!);
      if (error) throw error;
      return (data || []) as Unit[];
    },
  });
  const units = unitsQuery.data || [];
  const root = units.find((unit) => !unit.parent_id);
  const activeUnits = units.filter((unit) => !unit.archived_at);
  const currentUnit = units.find((unit) => unit.group_id === groupId);
  const manageQuery = useQuery({
    queryKey: ["hierarchy-manage", currentUnit?.id],
    enabled: !!currentUnit?.id,
    queryFn: async () => {
      const { data, error } = await createClient().rpc(
        "has_any_organization_scope", {
          p_target: currentUnit!.id, p_capability: "hierarchy.manage",
        },
      );
      if (error) throw error;
      return data === true;
    },
  });
  const grantsQuery = useQuery({
    queryKey: ["hierarchy-grants", organizationId],
    enabled: !!organizationId && manageQuery.data === true,
    queryFn: async () => {
      const { data, error } = await createClient().rpc(
        "list_organization_scope_grants", { p_organization: organizationId },
      );
      if (error) return null;
      return (data || []) as Grant[];
    },
  });
  const candidatesQuery = useQuery({
    queryKey: ["hierarchy-candidates", organizationId],
    enabled: !!organizationId && grantsQuery.data !== null &&
      grantsQuery.data !== undefined,
    queryFn: async () => {
      const { data, error } = await createClient().rpc(
        "list_organization_scope_candidates", { p_organization: organizationId },
      );
      if (error) throw error;
      return (data || []) as Array<{ user_id: string; display_name: string }>;
    },
  });
  const peopleQuery = useQuery({
    queryKey: ["hierarchy-people", root?.id],
    enabled: !!root?.id && manageQuery.data === true,
    queryFn: async () => {
      const { data, error } = await createClient().rpc(
        "list_organization_people", { p_grant_unit: root!.id },
      );
      if (error) return [] as Person[];
      return (data || []) as Person[];
    },
  });

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!organizationId || organizationId !== currentGroup?.organization_id || busy) return;
    setBusy(true);
    setFeedback("");
    try {
      const { error } = await action();
      if (error) throw new Error(error.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hierarchy-units", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["hierarchy-grants", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["hierarchy-candidates", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["hierarchy-people", root?.id] }),
        queryClient.invalidateQueries({ queryKey: ["hierarchy-context", organizationId] }),
      ]);
      setFeedback(t("saved"));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  if (!organizationId) return <p className="text-sm">{t("noOrganization")}</p>;
  const selectClass = "min-h-11 w-full rounded border bg-background px-3";
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      {feedback && <p role="status" className="rounded border p-2 text-sm">{feedback}</p>}
      {unitsQuery.isError && <p role="alert">{t("failed")}</p>}
      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">{t("units")}</h2>
        <ul className="mt-3 space-y-2">
          {activeUnits.map((unit) => (
            <li key={unit.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm">
              <span>{unit.name} · {unit.group_id ? t("operational") : t("aggregate")}</span>
              <span className="text-muted-foreground">
                {unit.parent_id ? `${t("parent")}: ${units.find((row) => row.id === unit.parent_id)?.name || "—"}` : t("root")}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {manageQuery.data === true && (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-4">
              <h2 className="font-semibold">{t("createAggregate")}</h2>
              <Label htmlFor="hierarchy-parent">{t("parent")}</Label>
              <select id="hierarchy-parent" className={selectClass} value={parentId}
                onChange={(event) => setParentId(event.target.value)}>
                <option value="">{t("chooseUnit")}</option>
                {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              <Label htmlFor="hierarchy-name">{t("unitName")}</Label>
              <Input id="hierarchy-name" value={newName}
                onChange={(event) => setNewName(event.target.value)} />
              <Button disabled={busy || !parentId || !newName.trim()} onClick={() =>
                run(() => createClient().rpc("create_aggregate_unit", {
                  p_parent: parentId, p_name: newName.trim(),
                }))}>{t("create")}</Button>
            </div>
            <div className="space-y-2 rounded-lg border p-4">
              <h2 className="font-semibold">{t("moveUnit")}</h2>
              <Label htmlFor="hierarchy-move-unit">{t("unit")}</Label>
              <select id="hierarchy-move-unit" className={selectClass} value={moveUnitId}
                onChange={(event) => setMoveUnitId(event.target.value)}>
                <option value="">{t("chooseUnit")}</option>
                {activeUnits.filter((unit) => !!unit.parent_id).map((unit) =>
                  <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              <Label htmlFor="hierarchy-move-parent">{t("newParent")}</Label>
              <select id="hierarchy-move-parent" className={selectClass} value={moveParentId}
                onChange={(event) => setMoveParentId(event.target.value)}>
                <option value="">{t("chooseUnit")}</option>
                {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              <Label htmlFor="hierarchy-reason">{t("reason")}</Label>
              <Input id="hierarchy-reason" value={moveReason}
                onChange={(event) => setMoveReason(event.target.value)} />
              <Button disabled={busy || !moveUnitId || !moveParentId || moveReason.trim().length < 8}
                onClick={() => run(() => createClient().rpc("move_organization_unit", {
                  p_unit: moveUnitId, p_new_parent: moveParentId,
                  p_reason: moveReason.trim(),
                }))}>{t("move")}</Button>
            </div>
          </section>
          <section className="space-y-2 rounded-lg border p-4">
            <h2 className="font-semibold">{t("archiveUnit")}</h2>
            <p className="text-sm text-muted-foreground">{t("archiveNote")}</p>
            <Label htmlFor="hierarchy-archive-unit">{t("unit")}</Label>
            <select id="hierarchy-archive-unit" className={selectClass}
              value={archiveUnitId} onChange={(event) => setArchiveUnitId(event.target.value)}>
              <option value="">{t("chooseUnit")}</option>
              {activeUnits.filter((unit) => unit.parent_id && !unit.group_id &&
                !activeUnits.some((child) => child.parent_id === unit.id))
                .map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            <Label htmlFor="hierarchy-archive-reason">{t("reason")}</Label>
            <Input id="hierarchy-archive-reason" value={archiveReason}
              onChange={(event) => setArchiveReason(event.target.value)} />
            <Button variant="destructive" disabled={busy || !archiveUnitId ||
              archiveReason.trim().length < 8}
              onClick={() => run(() => createClient().rpc("archive_organization_unit", {
                p_unit: archiveUnitId,p_reason: archiveReason.trim(),
              }))}>{t("archive")}</Button>
          </section>
          {grantsQuery.data !== null && grantsQuery.data !== undefined && <section className="space-y-3 rounded-lg border p-4">
            <h2 className="font-semibold">{t("grants")}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select aria-label={t("unit")} className={selectClass} value={grantUnitId}
                onChange={(event) => setGrantUnitId(event.target.value)}>
                <option value="">{t("chooseUnit")}</option>
                {activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              <select aria-label={t("member")} className={selectClass} value={grantUserId}
                onChange={(event) => setGrantUserId(event.target.value)}>
                <option value="">{t("chooseMember")}</option>
                {candidatesQuery.data?.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name}
                    </option>
                  ))}
              </select>
              <select aria-label={t("capability")} className={selectClass}
                value={grantCapability} onChange={(event) => setGrantCapability(event.target.value)}>
                <option value="hierarchy.manage">{t("manageHierarchy")}</option>
                <option value="elections.manage">{t("manageElections")}</option>
                <option value="reports.view">{t("viewReports")}</option>
              </select>
              <select aria-label={t("scopeMode")} className={selectClass}
                value={grantMode} onChange={(event) => setGrantMode(event.target.value)}>
                <option value="unit">{t("unitOnly")}</option>
                <option value="subtree">{t("subtree")}</option>
                <option value="organization">{t("wholeOrganization")}</option>
              </select>
            </div>
            <Button disabled={busy || !grantUnitId || !grantUserId}
              onClick={() => run(() => createClient().rpc("set_organization_scope_grant", {
                p_unit: grantUnitId,p_user: grantUserId,
                p_capability: grantCapability,p_scope_mode: grantMode,p_revoke: false,
              }))}>{t("grant")}</Button>
            <ul className="space-y-1 text-sm">
              {grantsQuery.data?.map((grant) => (
                <li key={`${grant.unit_id}:${grant.user_id}:${grant.capability}:${grant.scope_mode}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-1">
                  <span>{grant.display_name} · {grant.capability} · {grant.scope_mode} ·
                    {units.find((unit) => unit.id === grant.unit_id)?.name}</span>
                  <Button variant="outline" size="sm" disabled={busy}
                    onClick={() => run(() => createClient().rpc("set_organization_scope_grant", {
                      p_unit: grant.unit_id,p_user: grant.user_id,
                      p_capability: grant.capability,p_scope_mode: grant.scope_mode,
                      p_revoke: true,
                    }))}>{t("revoke")}</Button>
                </li>
              ))}
            </ul>
          </section>}
          {peopleQuery.data && peopleQuery.data.length > 0 && (
            <section className="space-y-2 rounded-lg border p-4">
              <h2 className="font-semibold">{t("identityReview")}</h2>
              <p className="text-sm text-muted-foreground">{t("identityWarning")}</p>
              {peopleQuery.data.map((person) => (
                <div key={person.person_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
                  <span>{person.display_name || person.user_id} ·
                    {person.active_memberships} {t("memberships")} ·
                    {person.verified_at ? t("verified") : t("unverified")}</span>
                  {!person.verified_at && <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => run(() => createClient().rpc("verify_organization_person", {
                      p_person: person.person_id,p_grant_unit: root!.id,
                    }))}>{t("verify")}</Button>}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
