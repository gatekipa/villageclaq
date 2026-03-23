"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Image,
  File,
  Search,
  Lock,
  Eye,
  Download,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocuments } from "@/lib/hooks/use-supabase-query";
import { useGroup } from "@/lib/group-context";
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

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function DocumentVaultPage() {
  const t = useTranslations("documentVault");
  useGroup();
  const { data: documents, isLoading, isError, error, refetch } = useDocuments();
  const [searchQuery, setSearchQuery] = useState("");

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

      {/* Search */}
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
      </div>

      {/* Document Grid or Empty State */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={t("noDocuments")}
          description={t("noDocumentsDesc")}
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
                        <Button variant="outline" size="sm">
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          {t("preview")}
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          {t("download")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
