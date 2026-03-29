"use client";

import { useState, useMemo, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { getDateLocale } from "@/lib/date-utils";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
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
  FileText,
  Image,
  File,
  Search,
  Lock,
  Eye,
  Download,
  FolderOpen,
  Plus,
  Upload,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { createClient } from "@/lib/supabase/client";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/ui/page-skeleton";

type CategoryKey =
  | "constitution"
  | "financial"
  | "certificate"
  | "meeting"
  | "photo"
  | "other";

const CATEGORY_COLORS: Record<CategoryKey, string> = {
  constitution: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  financial: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  certificate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  meeting: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  photo: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

function getFileIcon(fileType: string | null) {
  switch (fileType?.toUpperCase()) {
    case "PDF":
    case "DOCX":
    case "DOC":
      return <FileText className="h-8 w-8 text-muted-foreground" />;
    case "IMAGE":
    case "PNG":
    case "JPG":
    case "JPEG":
    case "GIF":
      return <Image className="h-8 w-8 text-muted-foreground" />;
    default:
      return <File className="h-8 w-8 text-muted-foreground" />;
  }
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string, locale: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(getDateLocale(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const CATEGORY_OPTIONS: CategoryKey[] = ["constitution", "financial", "certificate", "meeting", "photo", "other"];

export default function DocumentVaultPage() {
  const locale = useLocale();
  const t = useTranslations("documentVault");
  const { groupId, user } = useGroup();
  const { hasPermission } = usePermissions();
  const isAdmin = hasPermission("documents.manage");
  const queryClient = useQueryClient();
  const { data: documents, isLoading, isError, error, refetch } = useDocuments();
  const [searchQuery, setSearchQuery] = useState("");

  // Upload dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState<CategoryKey>("other");
  const [docDescription, setDocDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function resetUploadForm() {
    setDocTitle("");
    setDocCategory("other");
    setDocDescription("");
    setSelectedFile(null);
    setMutationError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleUpload() {
    if (!docTitle.trim() || !groupId || !user) return;
    setSaving(true);
    setMutationError(null);
    try {
      const supabase = createClient();
      let fileUrl = "";
      let fileType = "";
      let fileSize = 0;

      if (selectedFile) {
        fileType = selectedFile.name.split(".").pop()?.toUpperCase() || "";
        fileSize = selectedFile.size;
        const filePath = `${groupId}/${Date.now()}-${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("group-documents")
          .upload(filePath, selectedFile);
        if (uploadError) {
          // Storage bucket might not exist — continue with empty file_url
          console.warn("Storage upload failed:", uploadError.message);
        } else {
          const { data: urlData } = supabase.storage
            .from("group-documents")
            .getPublicUrl(filePath);
          fileUrl = urlData?.publicUrl || "";
        }
      }

      const { error: insertError } = await supabase.from("documents").insert({
        group_id: groupId,
        title: docTitle,
        category: docCategory,
        description: docDescription || null,
        file_url: fileUrl,
        file_type: fileType,
        file_size: fileSize,
        uploaded_by: user.id,
      });
      if (insertError) throw insertError;
      await queryClient.invalidateQueries({ queryKey: ["documents", groupId] });
      setDialogOpen(false);
      resetUploadForm();
    } catch (err) {
      setMutationError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    if (!documents) return [];
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter((doc: Record<string, unknown>) => {
      const title = (doc.title as string) || "";
      return title.toLowerCase().includes(q);
    });
  }, [documents, searchQuery]);

  if (isLoading) return <CardGridSkeleton cards={6} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Search + Upload */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchDocuments")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("uploadDocument")}
          </Button>
        )}
      </div>

      {/* Upload Document Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetUploadForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("uploadDocument")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("documentTitle")}</Label>
              <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder={t("documentTitle")} />
            </div>
            <div className="space-y-2">
              <Label>{t("category")}</Label>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value as CategoryKey)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`categories.${cat}` as Parameters<typeof t>[0])}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("description")}</Label>
              <Textarea value={docDescription} onChange={(e) => setDocDescription(e.target.value)} placeholder={t("description")} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{t("selectFile")}</Label>
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-4">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-sm"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("supportedFormats")}</p>
            </div>
            {mutationError && <p className="text-sm text-destructive">{mutationError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={handleUpload} disabled={saving || !docTitle.trim()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t("upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Grid or Empty State */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={t("noDocuments")}
          description={t("noDocumentsDesc")}
          action={
            isAdmin ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                {t("upload")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((doc: Record<string, unknown>) => {
            const id = doc.id as string;
            const title = (doc.title as string) || "";
            const category = (doc.category as CategoryKey) || "other";
            const fileType = (doc.file_type as string) || "";
            const fileSize = doc.file_size as number | null;
            const isRestricted = doc.is_restricted as boolean;
            const version = doc.version as number | null;
            const createdAt = (doc.created_at as string) || "";
            const uploader = doc.uploader as Record<string, unknown> | null;
            const uploaderName = (uploader?.full_name as string) || "";

            return (
              <Card
                key={id}
                className="hover:shadow-md transition-shadow dark:hover:shadow-lg dark:hover:shadow-black/20"
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* File Icon */}
                    <div className="flex-shrink-0 flex items-start pt-1">
                      {getFileIcon(fileType)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Title */}
                      <h3 className="font-semibold text-sm leading-tight truncate">{title}</h3>

                      {/* Badges */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="secondary"
                          className={CATEGORY_COLORS[category] || CATEGORY_COLORS.other}
                        >
                          {t(`categories.${category}` as Parameters<typeof t>[0])}
                        </Badge>
                        {isRestricted && (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <Lock className="h-3 w-3" />
                            {t("restrictedBadge")}
                          </Badge>
                        )}
                        {version && version > 1 && (
                          <Badge variant="outline">
                            {t("version")} {version}
                          </Badge>
                        )}
                      </div>

                      {/* Meta Info */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {fileType && <span>{fileType.toUpperCase()}</span>}
                        {fileSize && <span>{formatFileSize(fileSize)}</span>}
                        {createdAt && <span>{formatDate(createdAt)}</span>}
                      </div>

                      {uploaderName && (
                        <p className="text-xs text-muted-foreground">
                          {t("uploadedBy")} {uploaderName}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => { if (doc.file_url) window.open(doc.file_url as string, '_blank'); }}>
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          {t("preview")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { if (doc.file_url) window.open(doc.file_url as string, '_blank'); }}>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          {t("download")}
                        </Button>
                        {isAdmin && (
                          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setDeleteDocId(id); setDeleteDialogOpen(true); }}>
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            {t("deleteDocument")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteDocument")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("confirmDeleteDocument")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>{t("cancel" as Parameters<typeof t>[0])}</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!deleteDocId) return;
                setDeleting(true);
                try {
                  const supabase = createClient();
                  // Remove file from storage first
                  const docToDelete = documents?.find((d: Record<string, unknown>) => d.id === deleteDocId);
                  const fileUrl = docToDelete?.file_url as string;
                  if (fileUrl) {
                    const pathPart = fileUrl.split("/storage/v1/object/public/group-documents/")[1];
                    if (pathPart) {
                      await supabase.storage.from("group-documents").remove([decodeURIComponent(pathPart)]);
                    }
                  }
                  const { error } = await supabase.from('documents').delete().eq('id', deleteDocId);
                  if (error) throw error;
                  await queryClient.invalidateQueries({ queryKey: ['documents', groupId] });
                  setDeleteDialogOpen(false);
                  setDeleteDocId(null);
                } catch (err) {
                  console.error('Failed to delete document:', err);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("deleteDocument")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
