"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Users, Plus, Edit3, Trash2, Heart, Cake, User } from "lucide-react";

type Relationship = "spouse" | "child" | "parent" | "sibling" | "other";

interface FamilyMember {
  id: string;
  name: string;
  relationship: Relationship;
  birthday: string;
  notes?: string;
}

const INITIAL_MEMBERS: FamilyMember[] = [
  {
    id: "1",
    name: "Nkeng Aisha Fon",
    relationship: "spouse",
    birthday: "1990-06-15",
    notes: "Works at the university in Buea",
  },
  {
    id: "2",
    name: "Tabi Etienne Jr.",
    relationship: "child",
    birthday: "2015-03-22",
    notes: "Currently in primary school",
  },
  {
    id: "3",
    name: "Mbah Divine Ngwa",
    relationship: "child",
    birthday: "2019-11-08",
  },
  {
    id: "4",
    name: "Mami Comfort Enow",
    relationship: "parent",
    birthday: "1958-01-10",
    notes: "Lives in Kumba",
  },
];

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
  birthday: "",
  notes: "",
};

export default function MyFamilyPage() {
  const t = useTranslations("family");
  const tc = useTranslations("common");

  const [members, setMembers] = useState<FamilyMember[]>(INITIAL_MEMBERS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (member: FamilyMember) => {
    setEditingId(member.id);
    setForm({
      name: member.name,
      relationship: member.relationship,
      birthday: member.birthday,
      notes: member.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.relationship || !form.birthday) return;

    if (editingId) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === editingId
            ? {
                ...m,
                name: form.name,
                relationship: form.relationship as Relationship,
                birthday: form.birthday,
                notes: form.notes || undefined,
              }
            : m
        )
      );
    } else {
      setMembers((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: form.name,
          relationship: form.relationship as Relationship,
          birthday: form.birthday,
          notes: form.notes || undefined,
        },
      ]);
    }

    setDialogOpen(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
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
      {members.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold text-foreground">
              {t("noFamily")}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t("noFamilyDesc")}
            </p>
            <Button onClick={openAdd} className="mt-6">
              <Plus className="mr-2 h-4 w-4" />
              {t("addMember")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Family members grid */}
      {members.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map((member) => (
            <Card key={member.id} className="group relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      {member.relationship === "spouse" ? (
                        <Heart className="h-5 w-5 text-pink-500" />
                      ) : (
                        <User className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {member.name}
                      </CardTitle>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(member)}
                    >
                      <Edit3 className="h-4 w-4" />
                      <span className="sr-only">{t("editMember")}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(member.id)}
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
                  className={RELATIONSHIP_COLORS[member.relationship]}
                >
                  {t(`relationships.${member.relationship}`)}
                </Badge>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Cake className="h-4 w-4 shrink-0" />
                  <span>{formatDate(member.birthday)}</span>
                </div>

                {member.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {member.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
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
                value={form.birthday}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, birthday: e.target.value }))
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

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || !form.relationship || !form.birthday}
            >
              {editingId ? t("editMember") : t("addMember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
