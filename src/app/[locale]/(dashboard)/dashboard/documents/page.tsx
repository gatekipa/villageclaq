"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Upload,
  Search,
  Lock,
  Eye,
  Download,
  Plus,
  FolderOpen,
} from "lucide-react";

type CategoryKey =
  | "constitution"
  | "financial"
  | "certificate"
  | "meeting"
  | "photo"
  | "other";

interface MockDocument {
  id: string;
  title: string;
  category: CategoryKey;
  fileType: string;
  fileSize: string;
  uploadedBy: string;
  uploadDate: string;
  restricted: boolean;
  version?: number;
}

const CATEGORY_COLORS: Record<CategoryKey, string> = {
  constitution:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  financial:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  certificate:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  meeting:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  photo: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const MOCK_DOCUMENTS: MockDocument[] = [
  {
    id: "1",
    title: "Group Constitution v3",
    category: "constitution",
    fileType: "PDF",
    fileSize: "2.4 MB",
    uploadedBy: "Jude Anyere",
    uploadDate: "Jan 15, 2024",
    restricted: false,
    version: 3,
  },
  {
    id: "2",
    title: "Annual Financial Report 2025",
    category: "financial",
    fileType: "PDF",
    fileSize: "1.8 MB",
    uploadedBy: "Grace Tabi",
    uploadDate: "Dec 30, 2025",
    restricted: false,
  },
  {
    id: "3",
    title: "Registration Certificate",
    category: "certificate",
    fileType: "Image",
    fileSize: "856 KB",
    uploadedBy: "Jude Anyere",
    uploadDate: "Mar 10, 2025",
    restricted: true,
  },
  {
    id: "4",
    title: "March 2026 Meeting Minutes",
    category: "meeting",
    fileType: "DOCX",
    fileSize: "340 KB",
    uploadedBy: "Mercy Fon",
    uploadDate: "Mar 15, 2026",
    restricted: false,
  },
  {
    id: "5",
    title: "Treasurer's Quarterly Report Q1 2026",
    category: "financial",
    fileType: "PDF",
    fileSize: "1.2 MB",
    uploadedBy: "Grace Tabi",
    uploadDate: "Mar 20, 2026",
    restricted: true,
  },
  {
    id: "6",
    title: "Annual General Meeting Photos",
    category: "photo",
    fileType: "ZIP",
    fileSize: "45 MB",
    uploadedBy: "Paul Nkem",
    uploadDate: "Feb 28, 2026",
    restricted: false,
  },
  {
    id: "7",
    title: "Membership Application Form",
    category: "other",
    fileType: "PDF",
    fileSize: "120 KB",
    uploadedBy: "Jude Anyere",
    uploadDate: "Jan 5, 2025",
    restricted: false,
  },
  {
    id: "8",
    title: "Bylaws Amendment 2025",
    category: "constitution",
    fileType: "PDF",
    fileSize: "890 KB",
    uploadedBy: "Jude Anyere",
    uploadDate: "Nov 20, 2025",
    restricted: false,
    version: 2,
  },
];

function getFileIcon(fileType: string) {
  switch (fileType) {
    case "PDF":
    case "DOCX":
      return <FileText className="h-8 w-8 text-muted-foreground" />;
    case "Image":
      return <Image className="h-8 w-8 text-muted-foreground" />;
    default:
      return <File className="h-8 w-8 text-muted-foreground" />;
  }
}

export default function DocumentVaultPage() {
  const t = useTranslations("documentVault");
  const tc = useTranslations("common");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);

  const filteredDocuments = MOCK_DOCUMENTS.filter((doc) => {
    const matchesSearch = doc.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || doc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const categories: CategoryKey[] = [
    "constitution",
    "financial",
    "certificate",
    "meeting",
    "photo",
    "other",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setUploadDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("uploadDocument")}
        </Button>
      </div>

      {/* Search & Filter Row */}
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
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder={t("filterByCategory")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCategories")}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {t(`categories.${cat}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document Grid or Empty State */}
      {filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">{t("noDocuments")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("noDocumentsDesc")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDocuments.map((doc) => (
            <Card
              key={doc.id}
              className="hover:shadow-md transition-shadow dark:hover:shadow-lg dark:hover:shadow-black/20"
            >
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {/* File Icon */}
                  <div className="flex-shrink-0 flex items-start pt-1">
                    {getFileIcon(doc.fileType)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Title Row */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight truncate">
                        {doc.title}
                      </h3>
                    </div>

                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className={CATEGORY_COLORS[doc.category]}
                      >
                        {t(`categories.${doc.category}`)}
                      </Badge>
                      {doc.restricted && (
                        <Badge
                          variant="destructive"
                          className="flex items-center gap-1"
                        >
                          <Lock className="h-3 w-3" />
                          {t("restrictedBadge")}
                        </Badge>
                      )}
                      {doc.version && (
                        <Badge variant="outline">
                          {t("version")} {doc.version}
                        </Badge>
                      )}
                    </div>

                    {/* Meta Info */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{doc.fileType}</span>
                      <span>{doc.fileSize}</span>
                      <span>{doc.uploadDate}</span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {t("uploadedBy")} {doc.uploadedBy}
                    </p>

                    {/* Actions Row */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button variant="outline" size="sm">
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        {t("preview")}
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        {t("download")}
                      </Button>
                      {doc.version && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground"
                        >
                          {t("versionHistory")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("uploadDocument")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Title EN */}
            <div className="space-y-2">
              <Label>{t("documentTitleEn")}</Label>
              <Input placeholder={t("documentTitle")} />
            </div>

            {/* Title FR */}
            <div className="space-y-2">
              <Label>{t("documentTitleFr")}</Label>
              <Input placeholder={t("documentTitleFr")} />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>{t("category")}</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder={t("category")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`categories.${cat}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>{t("description")}</Label>
              <Textarea rows={3} />
            </div>

            {/* File Drop Zone */}
            <div className="space-y-2">
              <Label>{t("selectFile")}</Label>
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer border-muted-foreground/25 bg-muted/50 hover:bg-muted/80 transition-colors dark:hover:bg-muted/30">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {t("clickToUpload")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("supportedFormats")}
                  </p>
                </div>
                <input type="file" className="hidden" />
              </label>
            </div>

            {/* Restricted Switch */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  {t("restricted")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("restrictedHint")}
                </p>
              </div>
              <Switch
                checked={isRestricted}
                onCheckedChange={setIsRestricted}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
            >
              {tc("cancel")}
            </Button>
            <Button onClick={() => setUploadDialogOpen(false)}>
              <Upload className="mr-2 h-4 w-4" />
              {t("upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
