"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/ui/page-skeleton";
import { useGroup } from "@/lib/group-context";
import { useFamilyMembers } from "@/lib/hooks/use-supabase-query";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Edit3, Trash2, Heart, Cake, User } from "lucide-react";

type Relationship = "spouse" | "child" | "parent" | "sibling" | "other";

const RELATIONSHIP_COLORS: Record<Relationship, string> = {
  spouse:
    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  child:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  parent:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  sibling:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  other:
    "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
};

const EMPTY_FORM = {
  name: "",
  relationship: "" as Relationship | "",
  date_of_birth: "",
  notes: "",
};

export default function MyFamilyPage() {
  const locale = useLocale();
  const t = useTranslations("family");
  const tc = useTranslations("common");
  const { currentMembership, loading: groupLoading, currentGroup } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const queryClient = useQueryClient();

  const {
    data: members,
    isLoading,
    error,
    refetch,
  } = useFamilyMembers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (member: Record<string, unknown>) => {
    setEditingId(member.id as string);
    setForm({
      name: (member.name as string) || "",
      relationship: (member.relationship as Relationship) || "",
      date_of_birth: (member.date_of_birth as string) || "",
      notes: (member.notes as string) || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.relationship || !form.date_of_birth || !currentMembership) return;
    setSaving(true);

    const supabase = createClient();

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from("family_members")
          .update({
            name: form.name,
            relationship: form.relationship,
            date_of_birth: form.date_of_birth,
            notes: form.notes || null,
          })
          .eq("id", editingId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("family_members")
          .insert({
            membership_id: currentMembership.id,
            name: form.name,
            relationship: form.relationship,
            date_of_birth: form.date_of_birth,
            notes: form.notes || null,
          });
        if (insertError) throw insertError;
      }

      queryClient.invalidateQueries({
        queryKey: ["family-members", currentMembership.id],
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } catch (err) {
      console.error("Failed to save family member:", err);
      setSaveError(tc("error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentMembership) return;
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("family_members")
      .delete()
      .eq("id", id);
    if (!deleteError) {
      queryClient.invalidateQueries({
        queryKey: ["family-members", currentMembership.id],
      });
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return formatDateWithGroupFormat(dateStr, groupDateFormat, locale);
    } catch {
      return dateStr;
    }
  };

  if (groupLoading || isLoading) return <CardGridSkeleton cards={4} />;

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  const familyMembers = members || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          {t("addMember")}
        </Button>
      </div>

      {/* Empty state */}
      {familyMembers.length === 0 && (
        <EmptyState
          icon={Users}
          title={t("noFamily")}
          description={t("noFamilyDesc")}
          action={
            <Button onClick={openAdd}>
              <Plus className="mr-2 h-4 w-4" />
              {t("addMember")}
            </Button>
          }
        />
      )}

      {/* Family members grid */}
      {familyMembers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {familyMembers.map((member: Record<string, unknown>) => {
            const rel = (member.relationship as Relationship) || "other";
            return (
              <Card key={member.id as string} className="group relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        {rel === "spouse" ? (
                          <Heart className="h-5 w-5 text-pink-500" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">
                          {member.name as string}
                        </CardTitle>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(member)}
                      >
                        <Edit3 className="h-4 w-4" />
                        <span className="sr-only">{t("editMember")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(member.id as string)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{t("deleteMember")}</span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <Badge
                    variant="secondary"
                    className={RELATIONSHIP_COLORS[rel]}
                  >
                    {t(`relationships.${rel}`)}
                  </Badge>

                  {member.date_of_birth ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Cake className="h-4 w-4 shrink-0" />
                      <span>{formatDate(member.date_of_birth as string)}</span>
                    </div>
                  ) : null}

                  {member.notes ? (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {String(member.notes)}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("editMember") : t("addMember")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="family-name">{t("name")}</Label>
              <Input
                id="family-name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder={t("name")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="family-relationship">{t("relationship")}</Label>
              <Select
                value={form.relationship}
                onValueChange={(val) =>
                  setForm((prev) => ({
                    ...prev,
                    relationship: val as Relationship,
                  }))
                }
              >
                <SelectTrigger id="family-relationship">
                  <SelectValue placeholder={t("relationship")} />
                </SelectTrigger>
                <SelectContent>
                  {(
                    ["spouse", "child", "parent", "sibling", "other"] as const
                  ).map((rel) => (
                    <SelectItem key={rel} value={rel}>
                      {t(`relationships.${rel}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="family-birthday">{t("birthday")}</Label>
              <Input
                id="family-birthday"
                type="date"
                value={form.date_of_birth}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    date_of_birth: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="family-notes">{t("notes")}</Label>
              <Textarea
                id="family-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder={t("notes")}
                rows={3}
              />
            </div>
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                !form.name ||
                !form.relationship ||
                !form.date_of_birth ||
                saving
              }
            >
              {saving
                ? tc("saving")
                : editingId
                  ? t("editMember")
                  : t("addMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
