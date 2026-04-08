"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDateWithGroupFormat } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useGroup } from "@/lib/group-context";
// permissions checked via isAdmin from useGroup()
import { useMembers } from "@/lib/hooks/use-supabase-query";
import { getMemberName } from "@/lib/get-member-name";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ScrollText,
  Upload,
  Pencil,
  Download,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Loader2,
  Search,
  FileText,
} from "lucide-react";
import { EmptyState, ListSkeleton, ErrorState } from "@/components/ui/page-skeleton";

const supabase = createClient();

const DOC_TYPE_KEYS = ["Constitution", "Bylaws", "Standing Rules", "Code of Conduct", "Financial Policy", "Meeting Procedures", "Membership Policy"] as const;

// ─── Data Hooks ──────────────────────────────────────────────────────────────

/** Fetch ALL governing documents (latest version of each unique title) */
function useAllDocuments(groupId: string | null) {
  return useQuery({
    queryKey: ["all-constitutions", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("group_constitutions")
        .select("*")
        .eq("group_id", groupId)
        .in("status", ["published", "draft"])
        .order("version_number", { ascending: false });
      if (error) {
        if (error.code === "42P01" || error.message?.includes("does not exist")) return [];
        throw error;
      }
      // Deduplicate: keep latest version per title
      const seen = new Map<string, Record<string, unknown>>();
      for (const doc of (data || [])) {
        const title = (doc.title as string) || "";
        if (!seen.has(title)) seen.set(title, doc);
      }
      return Array.from(seen.values());
    },
    enabled: !!groupId,
    retry: false,
  });
}

/** Fetch the published version for a specific document title */
function useConstitution(groupId: string | null, docTitle: string | null) {
  return useQuery({
    queryKey: ["constitution", groupId, docTitle],
    queryFn: async () => {
      if (!groupId || !docTitle) return null;
      const { data, error } = await supabase
        .from("group_constitutions")
        .select("*")
        .eq("group_id", groupId)
        .eq("title", docTitle)
        .eq("status", "published")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!groupId && !!docTitle,
    retry: false,
  });
}

/** Fetch the draft version for a specific document title */
function useDraft(groupId: string | null, docTitle: string | null) {
  return useQuery({
    queryKey: ["constitution-draft", groupId, docTitle],
    queryFn: async () => {
      if (!groupId || !docTitle) return null;
      const { data, error } = await supabase
        .from("group_constitutions")
        .select("*")
        .eq("group_id", groupId)
        .eq("title", docTitle)
        .eq("status", "draft")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!groupId && !!docTitle,
    retry: false,
  });
}

function useAmendments(groupId: string | null) {
  return useQuery({
    queryKey: ["amendments", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("constitution_amendments")
        .select("*, proposer:memberships!constitution_amendments_proposed_by_fkey(id, display_name, is_proxy, profiles:profiles!memberships_user_id_fkey(id, full_name))")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data || []).map((a: Record<string, unknown>) => {
        const m = a.proposer as Record<string, unknown> | null;
        return { ...a, proposer: m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null };
      });
    },
    enabled: !!groupId,
    retry: false,
  });
}

function useAcknowledgments(constitutionId: string | null) {
  return useQuery({
    queryKey: ["acknowledgments", constitutionId],
    queryFn: async () => {
      if (!constitutionId) return [];
      const { data, error } = await supabase
        .from("constitution_acknowledgments")
        .select("*, membership:memberships!constitution_acknowledgments_membership_id_fkey(id, display_name, is_proxy, profiles:profiles!memberships_user_id_fkey(id, full_name))")
        .eq("constitution_id", constitutionId)
        .order("acknowledged_at", { ascending: false });
      if (error) return [];
      return (data || []).map((a: Record<string, unknown>) => {
        const m = a.membership as Record<string, unknown> | null;
        return { ...a, membership: m ? { ...m, profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles } : null };
      });
    },
    enabled: !!constitutionId,
    retry: false,
  });
}

// ─── Safe text renderer (no dangerouslySetInnerHTML) ─────────────────────────

function HighlightedText({ content, query }: { content: string; query: string }) {
  if (!query.trim()) {
    return <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">{content}</div>;
  }
  const parts = content.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800">{part}</mark>
          : part
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ConstitutionPage() {
  const t = useTranslations("constitution");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { groupId, currentMembership, isAdmin, currentGroup } = useGroup();
  const groupDateFormat = ((currentGroup?.settings as Record<string, unknown>)?.date_format as string) || "DD/MM/YYYY";
  const queryClient = useQueryClient();
  const { data: members } = useMembers();

  // Document selector
  const { data: allDocs = [], isLoading: docsLoading, error: constError } = useAllDocuments(groupId);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [newDocType, setNewDocType] = useState("");
  const [newDocCustomTitle, setNewDocCustomTitle] = useState("");

  // Auto-select first document
  const activeTitle = selectedTitle || (allDocs.length > 0 ? (allDocs[0].title as string) : null);

  const { data: constitution } = useConstitution(groupId, activeTitle);
  const { data: draft } = useDraft(groupId, activeTitle);
  const { data: amendments = [] } = useAmendments(groupId);
  const { data: acknowledgments = [] } = useAcknowledgments(constitution?.id || null);

  // State
  const [editing, setEditing] = useState(false);
  const [editorContent, setEditorContent] = useState("");
  const [editorTitle, setEditorTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Amendment dialog
  const [showAmendDialog, setShowAmendDialog] = useState(false);
  const [amendTitle, setAmendTitle] = useState("");
  const [amendSection, setAmendSection] = useState("");
  const [amendOldText, setAmendOldText] = useState("");
  const [amendNewText, setAmendNewText] = useState("");
  const [amendReason, setAmendReason] = useState("");
  const [amendSaving, setAmendSaving] = useState(false);

  // Publish confirmation
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);

  // Acknowledgment
  const [acknowledging, setAcknowledging] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [applyingAmendment, setApplyingAmendment] = useState(false);
  const [amendmentActionId, setAmendmentActionId] = useState<string | null>(null);

  const memberCount = (members || []).length;
  const currentVersion = constitution?.version_number || 0;
  const hasAcknowledged = acknowledgments.some(
    (a: Record<string, unknown>) => (a.membership as Record<string, unknown>)?.id === currentMembership?.id && (a.version_number as number) === currentVersion
  );
  const ackCount = acknowledgments.filter((a: Record<string, unknown>) => (a.version_number as number) === currentVersion).length;
  const ackRate = memberCount > 0 ? Math.round((ackCount / memberCount) * 100) : 0;

  // ─── Handlers ────────────────────────────────────────────────────────

  const handleStartEdit = () => {
    const source = draft || constitution;
    setEditorContent((source?.content as string) || "");
    setEditorTitle((source?.title as string) || activeTitle || "");
    setEditing(true);
  };

  const handleSave = async () => {
    if (!groupId || !currentMembership) return;
    setSaving(true);
    setActionError(null);
    try {
      if (draft) {
        // Update the existing draft record
        const { error: upErr } = await supabase
          .from("group_constitutions")
          .update({ content: editorContent, title: editorTitle })
          .eq("id", draft.id);
        if (upErr) throw upErr;
      } else {
        // Check-then-insert: avoids the 409 "no unique constraint" UPSERT error
        const docType = activeTitle || "Constitution";
        // Broader check: find ANY draft for this group+docType (including old rows with NULL document_type)
        const { data: existingDrafts } = await supabase
          .from("group_constitutions")
          .select("id, document_type")
          .eq("group_id", groupId)
          .eq("status", "draft")
          .limit(10);
        const existingDraft = (existingDrafts || []).find(
          (d: Record<string, unknown>) => d.document_type === docType || d.document_type === null
        );
        if (existingDraft) {
          const { error: upErr } = await supabase
            .from("group_constitutions")
            .update({ content: editorContent, title: editorTitle, document_type: docType })
            .eq("id", existingDraft.id);
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await supabase
            .from("group_constitutions")
            .insert({
              group_id: groupId,
              document_type: docType,
              title: editorTitle,
              content: editorContent,
              version_number: currentVersion + 1,
              status: "draft",
            });
          // If conflict (concurrent insert), fall back to update
          if (insErr && insErr.code === "23505") {
            const { data: conflictRow } = await supabase
              .from("group_constitutions")
              .select("id")
              .eq("group_id", groupId)
              .eq("status", "draft")
              .limit(1)
              .maybeSingle();
            if (conflictRow) {
              const { error: upErr } = await supabase
                .from("group_constitutions")
                .update({ content: editorContent, title: editorTitle, document_type: docType })
                .eq("id", conflictRow.id);
              if (upErr) throw upErr;
            } else {
              throw insErr;
            }
          } else if (insErr) {
            throw insErr;
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ["constitution-draft"] });
      queryClient.invalidateQueries({ queryKey: ["all-constitutions", groupId] });
      if (!selectedTitle) setSelectedTitle(editorTitle);
      setEditing(false);
    } catch (err) {
      setActionError((err as Error).message || tc("error"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNewDoc = () => {
    const title = newDocType === "Other" ? newDocCustomTitle.trim() : newDocType;
    if (!title) return;
    setEditorTitle(title);
    setEditorContent("");
    setSelectedTitle(title);
    setShowNewDocDialog(false);
    setNewDocType("");
    setNewDocCustomTitle("");
    setEditing(true);
  };

  const handleNewDocUpload = () => {
    const title = newDocType === "Other" ? newDocCustomTitle.trim() : newDocType;
    if (!title) return;
    setSelectedTitle(title);
    setShowNewDocDialog(false);
    setNewDocType("");
    setNewDocCustomTitle("");
    // Trigger file picker after closing dialog
    setTimeout(() => document.getElementById("const-upload")?.click(), 100);
  };

  const handlePublish = async () => {
    if (!groupId || !currentMembership) return;
    setPublishing(true);
    try {
      const source = draft || constitution;
      if (!source) return;
      if (source.status === "draft") {
        if (constitution?.id) {
          await supabase.from("group_constitutions").update({ status: "archived" }).eq("id", constitution.id);
        }
        await supabase.from("group_constitutions").update({
          status: "published", published_at: new Date().toISOString(), published_by: currentMembership.id,
        }).eq("id", source.id);
      }
      const memberList = (members || []) as Array<Record<string, unknown>>;
      if (memberList.length > 0) {
        await supabase.from("notifications").insert(
          memberList.filter((m) => m.user_id).map((m) => ({
            group_id: groupId, user_id: m.user_id as string, type: "system" as const,
            title: t("constitutionUpdatedNotif"), body: t("constitutionUpdatedNotifMsg"), is_read: false,
            data: { link: "/dashboard/constitution" },
          }))
        );
      }
      queryClient.invalidateQueries({ queryKey: ["constitution"] });
      queryClient.invalidateQueries({ queryKey: ["constitution-draft"] });
      queryClient.invalidateQueries({ queryKey: ["all-constitutions", groupId] });
    } finally { setPublishing(false); }
  };

  const handleAcknowledge = async () => {
    if (!constitution?.id || !currentMembership) return;
    setAcknowledging(true);
    try {
      await supabase.from("constitution_acknowledgments").insert({
        constitution_id: constitution.id, membership_id: currentMembership.id, version_number: constitution.version_number,
      });
      queryClient.invalidateQueries({ queryKey: ["acknowledgments", constitution.id] });
    } finally { setAcknowledging(false); }
  };

  const handleProposeAmendment = async () => {
    if (!groupId || !constitution?.id || !currentMembership || !amendTitle.trim()) return;
    setAmendSaving(true);
    try {
      await supabase.from("constitution_amendments").insert({
        constitution_id: constitution.id, group_id: groupId, amendment_number: amendments.length + 1,
        title: amendTitle.trim(), section_affected: amendSection.trim() || null,
        old_text: amendOldText.trim() || null, new_text: amendNewText.trim() || null,
        reason: amendReason.trim() || null, proposed_by: currentMembership.id, status: "proposed",
      });
      queryClient.invalidateQueries({ queryKey: ["amendments", groupId] });
      setShowAmendDialog(false);
      setAmendTitle(""); setAmendSection(""); setAmendOldText(""); setAmendNewText(""); setAmendReason("");
    } finally { setAmendSaving(false); }
  };

  const handleAmendmentAction = async (amendId: string, action: "approved" | "rejected") => {
    if (amendmentActionId) return;
    setAmendmentActionId(amendId);
    try {
      setActionError(null);
      const { error } = await supabase.from("constitution_amendments").update({
        status: action, approved_at: new Date().toISOString(), approved_by: currentMembership?.id,
      }).eq("id", amendId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["amendments", groupId] });
    } catch {
      setActionError(tc("error"));
    } finally {
      setAmendmentActionId(null);
    }
  };

  const handleApplyAmendment = async (amend: Record<string, unknown>) => {
    if (!constitution?.id || !groupId || !currentMembership) return;
    setApplyingAmendment(true);
    setActionError(null);
    try {
      const oldText = amend.old_text as string;
      const newText = amend.new_text as string;
      const currentContent = (constitution.content as string) || "";

      // Apply text replacement if both old and new text are provided
      let updatedContent = currentContent;
      if (oldText && newText) {
        updatedContent = currentContent.replace(oldText, newText);
      } else if (newText) {
        // Append new text if no old text specified
        updatedContent = currentContent + "\n\n" + newText;
      }

      // Archive current published version
      await supabase.from("group_constitutions").update({ status: "archived" }).eq("id", constitution.id);

      // Create new published version
      const newVersion = (constitution.version_number as number) + 1;
      await supabase.from("group_constitutions").insert({
        group_id: groupId, title: constitution.title, content: updatedContent,
        version_number: newVersion, status: "published",
        published_at: new Date().toISOString(), published_by: currentMembership.id,
      });

      // Mark amendment as applied
      await supabase.from("constitution_amendments").update({ status: "applied" }).eq("id", amend.id as string);

      queryClient.invalidateQueries({ queryKey: ["constitution"] });
      queryClient.invalidateQueries({ queryKey: ["all-constitutions", groupId] });
      queryClient.invalidateQueries({ queryKey: ["amendments", groupId] });
    } catch {
      setActionError(tc("error"));
    } finally {
      setApplyingAmendment(false);
    }
  };

  const handleSendReminder = async () => {
    if (!groupId || !constitution?.id) return;
    setSendingReminder(true);
    try {
      const ackedIds = new Set(acknowledgments.filter((a: Record<string, unknown>) => (a.version_number as number) === currentVersion).map((a: Record<string, unknown>) => (a.membership as Record<string, unknown>)?.id));
      const pending = (members || []).filter((m: Record<string, unknown>) => !ackedIds.has(m.id));
      if (pending.length > 0) {
        await supabase.from("notifications").insert(
          pending.filter((m: Record<string, unknown>) => m.user_id).map((m: Record<string, unknown>) => ({
            group_id: groupId, user_id: m.user_id as string, type: "system" as const,
            title: t("reviewConstitution"), body: t("reviewConstitutionMessage"), is_read: false,
            data: { link: "/dashboard/constitution" },
          }))
        );
      }
    } finally { setSendingReminder(false); }
  };

  const handleFileUpload = async (file: File) => {
    if (!groupId) return;
    if (file.size > 10 * 1024 * 1024) {
      setActionError(t("fileTooLarge"));
      return;
    }
    setFileUploading(true);
    try {
      const path = `constitutions/${groupId}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("group-documents").upload(path, file, { upsert: true });
      if (uploadErr) {
        setActionError(uploadErr.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("group-documents").getPublicUrl(path);
      const fileTitle = file.name.replace(/\.[^.]+$/, "");
      const docType = activeTitle || "Constitution";
      // Check for existing draft for this group+docType (including old rows with NULL document_type)
      const { data: existingFileDrafts } = await supabase
        .from("group_constitutions")
        .select("id, document_type")
        .eq("group_id", groupId)
        .eq("status", "draft")
        .limit(10);
      const existingFileDraft = (existingFileDrafts || []).find(
        (d: Record<string, unknown>) => d.document_type === docType || d.document_type === null
      );
      if (existingFileDraft) {
        const { error: upErr } = await supabase
          .from("group_constitutions")
          .update({ title: fileTitle, file_url: urlData.publicUrl, document_type: docType })
          .eq("id", existingFileDraft.id);
        if (upErr) throw upErr;
      } else {
        // Query the actual MAX version_number from DB (not stale React state)
        // to avoid duplicate key violations when uploading multiple files
        const { data: maxRow } = await supabase
          .from("group_constitutions")
          .select("version_number")
          .eq("group_id", groupId)
          .order("version_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextVersion = ((maxRow?.version_number as number) || 0) + 1;

        const { error: insErr } = await supabase
          .from("group_constitutions")
          .insert({
            group_id: groupId,
            document_type: docType,
            title: fileTitle,
            file_url: urlData.publicUrl,
            version_number: nextVersion,
            status: "draft",
          });
        if (insErr && insErr.code === "23505") {
          // Concurrent insert — fall back to update the existing row
          const { data: conflictRow } = await supabase
            .from("group_constitutions")
            .select("id")
            .eq("group_id", groupId)
            .eq("status", "draft")
            .limit(1)
            .maybeSingle();
          if (conflictRow) {
            const { error: upErr } = await supabase
              .from("group_constitutions")
              .update({ title: fileTitle, file_url: urlData.publicUrl, document_type: docType })
              .eq("id", conflictRow.id);
            if (upErr) throw upErr;
          } else {
            throw insErr;
          }
        } else if (insErr) {
          throw insErr;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["constitution-draft"] });
      queryClient.invalidateQueries({ queryKey: ["all-constitutions", groupId] });
    } catch {
      setActionError(tc("error"));
    } finally {
      setFileUploading(false);
      setUploadProgress("");
    }
  };

  const handleMultipleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) =>
      /\.(pdf|docx?|txt|png|jpg|jpeg|webp)$/i.test(f.name)
    );
    if (fileArray.length === 0) return;
    for (let i = 0; i < fileArray.length; i++) {
      setUploadProgress(t("uploadingProgress", { current: i + 1, total: fileArray.length }));
      await handleFileUpload(fileArray[i]);
    }
    setUploadProgress("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleMultipleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  if (constError) {
    return (
      <div className="space-y-6">
        <div><h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1><p className="text-muted-foreground">{t("description")}</p></div>
        <EmptyState icon={ScrollText} title={t("noConstitution")} description={t("noConstitutionDesc")} />
      </div>
    );
  }

  const activeDoc = draft || constitution;
  const hasContent = !!(activeDoc?.content || activeDoc?.file_url);

  if (docsLoading) return <ListSkeleton rows={4} />;
  if (constError) return <ErrorState message={(constError as Error).message} onRetry={() => queryClient.invalidateQueries({ queryKey: ["all-constitutions", groupId] })} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1><p className="text-muted-foreground">{t("description")}</p></div>
        <div className="flex items-center gap-2">
          {isAdmin && hasContent && draft && (
            <Button onClick={() => setShowPublishConfirm(true)} disabled={publishing}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {t("publish")}
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowNewDocDialog(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              {t("addNewDocument")}
            </Button>
          )}
        </div>
      </div>

      {/* Action Error Display */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-400">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto text-red-500 hover:text-red-700 dark:hover:text-red-300">✕</button>
        </div>
      )}

      {/* Document Selector */}
      {allDocs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {allDocs.map((doc: Record<string, unknown>) => {
            const title = doc.title as string;
            const isActive = title === activeTitle;
            return (
              <Button
                key={doc.id as string}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className="shrink-0"
                onClick={() => { setSelectedTitle(title); setEditing(false); setSearchQuery(""); }}
              >
                <ScrollText className="mr-1.5 h-3.5 w-3.5" />
                {title}
                <Badge variant="secondary" className="ml-1.5 text-[10px]">
                  {doc.status === "published" ? "v" + String(doc.version_number) : t("draft")}
                </Badge>
              </Button>
            );
          })}
        </div>
      )}

      <Tabs defaultValue="document" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="document">{t("document")}</TabsTrigger>
          <TabsTrigger value="amendments">{t("amendments")}</TabsTrigger>
          <TabsTrigger value="acknowledgments">{t("acknowledgments")}</TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Document ═══ */}
        <TabsContent value="document" className="mt-4 space-y-4">
          {!hasContent && !editing ? (
            <EmptyState icon={ScrollText} title={t("noConstitution")} description={t("noConstitutionDesc")} action={isAdmin ? (
              <div className="space-y-4">
                <div className="flex gap-2 justify-center">
                  <Button onClick={handleStartEdit}><Pencil className="mr-2 h-4 w-4" />{t("writeConstitution")}</Button>
                  <div>
                    <input type="file" accept=".pdf,.doc,.docx,.txt,image/*" multiple className="hidden" id="const-upload" onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleMultipleFiles(e.target.files); }} />
                    <Button variant="outline" disabled={fileUploading} onClick={() => document.getElementById("const-upload")?.click()}>
                      {fileUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      {uploadProgress || (fileUploading ? tc("loading") : t("uploadDocument"))}
                    </Button>
                  </div>
                </div>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
                >
                  <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{t("dragDrop")}</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, DOC, TXT, Images</p>
                </div>
              </div>
            ) : undefined} />
          ) : editing ? (
            <Card>
              <CardHeader className="pb-2"><Input value={editorTitle} onChange={(e) => setEditorTitle(e.target.value)} className="text-lg font-bold border-0 px-0 focus-visible:ring-0" /></CardHeader>
              <CardContent>
                <Textarea value={editorContent} onChange={(e) => setEditorContent(e.target.value)} rows={20} className="min-h-[400px] font-mono text-sm" placeholder={t("editorPlaceholder")} />
                <div className="mt-4 flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setEditing(false)}>{tc("cancel")}</Button>
                  <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("save")}</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={activeDoc?.status === "published" ? "default" : "secondary"}>{activeDoc?.status === "published" ? t("published") : t("draft")}</Badge>
                  <span className="text-sm text-muted-foreground">{t("version", { number: activeDoc?.version_number || 1 })}</span>
                  {activeDoc?.published_at && <span className="text-xs text-muted-foreground">· {formatDateWithGroupFormat(activeDoc.published_at as string, groupDateFormat, locale)}</span>}
                </div>
                {isAdmin && <Button variant="outline" size="sm" onClick={handleStartEdit}><Pencil className="mr-2 h-3.5 w-3.5" />{t("editConstitution")}</Button>}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder={t("searchConstitution")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              </div>
              {activeDoc?.file_url ? (
                <Card><CardContent className="p-4"><a href={activeDoc.file_url as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline"><FileText className="h-5 w-5" />{(activeDoc.title as string) || t("title")}</a></CardContent></Card>
              ) : activeDoc?.content ? (
                <Card><CardContent className="p-6"><h2 className="text-xl font-bold mb-4">{activeDoc.title as string}</h2><HighlightedText content={activeDoc.content as string} query={searchQuery} /></CardContent></Card>
              ) : null}
              {constitution?.status === "published" && (
                <Card className={hasAcknowledged ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"}>
                  <CardContent className="p-4">
                    {hasAcknowledged ? (
                      <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /><p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{t("acknowledged")}</p></div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t("acknowledgePrompt")}</p>
                        <Button onClick={handleAcknowledge} disabled={acknowledging}>{acknowledging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{t("acknowledge")}</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══ TAB: Amendments ═══ */}
        <TabsContent value="amendments" className="mt-4 space-y-4">
          {isAdmin && constitution && (
            <div className="flex justify-end"><Button onClick={() => setShowAmendDialog(true)}><Plus className="mr-2 h-4 w-4" />{t("proposeAmendment")}</Button></div>
          )}
          {amendments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("noAmendments")}</p>
          ) : (
            <div className="space-y-3">
              {amendments.map((amend: Record<string, unknown>) => {
                const proposer = amend.proposer as Record<string, unknown> | null;
                const sc: Record<string, string> = { proposed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400", rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", applied: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" };
                return (
                  <Card key={amend.id as string}><CardContent className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">#{amend.amendment_number as number}</span>
                          <span className="font-medium text-sm">{amend.title as string}</span>
                          <Badge className={`text-xs ${sc[amend.status as string] || ""}`}>{t(amend.status as "proposed")}</Badge>
                        </div>
                        {(amend.section_affected as string) ? <p className="text-xs text-muted-foreground mt-1">{t("sectionLabel", { section: String(amend.section_affected) })}</p> : null}
                        {(amend.reason as string) ? <p className="text-xs text-muted-foreground mt-1">{String(amend.reason)}</p> : null}
                        <p className="text-xs text-muted-foreground mt-1">{getMemberName(proposer as Record<string, unknown>)} · {formatDateWithGroupFormat(amend.created_at as string, groupDateFormat, locale)}</p>
                      </div>
                      {isAdmin && amend.status === "proposed" && (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="default" className="h-7 text-xs" disabled={amendmentActionId === (amend.id as string)} onClick={() => handleAmendmentAction(amend.id as string, "approved")}>{t("approve")}</Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={amendmentActionId === (amend.id as string)} onClick={() => handleAmendmentAction(amend.id as string, "rejected")}>{t("reject")}</Button>
                        </div>
                      )}
                      {isAdmin && amend.status === "approved" && constitution && (
                        <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleApplyAmendment(amend)}>{t("apply")}</Button>
                      )}
                    </div>
                  </CardContent></Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ TAB: Acknowledgments ═══ */}
        <TabsContent value="acknowledgments" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("acknowledged")}</p><p className="text-2xl font-bold text-emerald-600">{ackCount} <span className="text-sm font-normal text-muted-foreground">/ {memberCount} ({ackRate}%)</span></p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("pending")}</p><p className="text-2xl font-bold text-amber-600">{memberCount - ackCount}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("version", { number: currentVersion })}</p><Progress value={ackRate} className="h-2 mt-2" /></CardContent></Card>
          </div>
          {isAdmin && memberCount - ackCount > 0 && (
            <Button variant="default" size="sm" onClick={handleSendReminder} disabled={sendingReminder}>
              {sendingReminder ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}{t("sendReminder")}
            </Button>
          )}
          {constitution ? (
            <Card><CardContent className="p-0"><div className="divide-y">
              {acknowledgments.filter((a: Record<string, unknown>) => (a.version_number as number) === currentVersion).map((ack: Record<string, unknown>) => (
                <div key={ack.id as string} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium">{getMemberName(ack.membership as Record<string, unknown>)}</span>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs"><CheckCircle2 className="mr-1 h-3 w-3" />{t("acknowledged")}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDateWithGroupFormat(ack.acknowledged_at as string, groupDateFormat, locale)}</span>
                  </div>
                </div>
              ))}
              {(() => {
                const ackedIds = new Set(acknowledgments.filter((a: Record<string, unknown>) => (a.version_number as number) === currentVersion).map((a: Record<string, unknown>) => (a.membership as Record<string, unknown>)?.id));
                return (members || []).filter((m: Record<string, unknown>) => !ackedIds.has(m.id)).map((m: Record<string, unknown>) => (
                  <div key={m.id as string} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-medium text-muted-foreground">{getMemberName(m)}</span>
                    <Badge variant="outline" className="text-xs"><Clock className="mr-1 h-3 w-3" />{t("pending")}</Badge>
                  </div>
                ));
              })()}
            </div></CardContent></Card>
          ) : <p className="text-sm text-muted-foreground py-4 text-center">{t("noConstitution")}</p>}
        </TabsContent>
      </Tabs>

      {/* Propose Amendment Dialog */}
      <Dialog open={showAmendDialog} onOpenChange={setShowAmendDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("proposeAmendment")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t("amendmentTitle")} *</Label><Input value={amendTitle} onChange={(e) => setAmendTitle(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t("sectionAffected")}</Label><Input value={amendSection} onChange={(e) => setAmendSection(e.target.value)} placeholder={t("sectionPlaceholder")} /></div>
            <div className="space-y-2"><Label>{t("currentText")}</Label><Textarea value={amendOldText} onChange={(e) => setAmendOldText(e.target.value)} rows={3} /></div>
            <div className="space-y-2"><Label>{t("proposedText")}</Label><Textarea value={amendNewText} onChange={(e) => setAmendNewText(e.target.value)} rows={3} /></div>
            <div className="space-y-2"><Label>{t("reasonForAmendment")}</Label><Textarea value={amendReason} onChange={(e) => setAmendReason(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAmendDialog(false)}>{tc("cancel")}</Button>
            <Button onClick={handleProposeAmendment} disabled={amendSaving || !amendTitle.trim()}>{amendSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("proposeAmendment")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish Confirmation Dialog */}
      <Dialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("publish")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("publishConfirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPublishConfirm(false)}>{tc("cancel")}</Button>
            <Button onClick={async () => { setShowPublishConfirm(false); await handlePublish(); }} disabled={publishing}>
              {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Document Dialog */}
      <Dialog open={showNewDocDialog} onOpenChange={setShowNewDocDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("addNewDocument")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("documentType")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {DOC_TYPE_KEYS.map((dtype) => (
                  <button
                    key={dtype}
                    type="button"
                    onClick={() => { setNewDocType(dtype); setNewDocCustomTitle(""); }}
                    className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${newDocType === dtype ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <ScrollText className="h-3.5 w-3.5 mb-1 text-primary" />
                    {t(`docType_${dtype.replace(/\s+/g, "")}` as never) || dtype}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setNewDocType("Other")}
                  className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${newDocType === "Other" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <FileText className="h-3.5 w-3.5 mb-1 text-muted-foreground" />
                  {tc("other")}
                </button>
              </div>
            </div>
            {newDocType === "Other" && (
              <div className="space-y-2">
                <Label>{t("amendmentTitle")}</Label>
                <Input value={newDocCustomTitle} onChange={(e) => setNewDocCustomTitle(e.target.value)} placeholder={t("customDocPlaceholder")} />
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowNewDocDialog(false)}>{tc("cancel")}</Button>
            <Button variant="outline" onClick={handleNewDocUpload} disabled={!newDocType || (newDocType === "Other" && !newDocCustomTitle.trim())}>
              <Upload className="mr-2 h-4 w-4" />
              {t("uploadDocument")}
            </Button>
            <Button onClick={handleCreateNewDoc} disabled={!newDocType || (newDocType === "Other" && !newDocCustomTitle.trim())}>
              <Pencil className="mr-2 h-4 w-4" />
              {t("writeConstitution")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
