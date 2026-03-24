"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  MessageSquareQuote,
  HelpCircle,
  Plus,
  Star,
  GripVertical,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";

interface Testimonial {
  id: string;
  name: string;
  role: string;
  group_name: string;
  quote: string;
  featured: boolean;
  sort_order: number;
}

interface Faq {
  id: string;
  question_en: string;
  question_fr: string;
  answer_en: string;
  answer_fr: string;
  category: string;
  sort_order: number;
}

const categoryColors: Record<string, string> = {
  General: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Billing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Security: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Features: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export default function ContentPage() {
  const t = useTranslations("admin");
  const [testimonialDialogOpen, setTestimonialDialogOpen] = useState(false);
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [saving, setSaving] = useState(false);

  // Testimonial form state
  const [tName, setTName] = useState("");
  const [tRole, setTRole] = useState("");
  const [tGroup, setTGroup] = useState("");
  const [tQuote, setTQuote] = useState("");
  const [tFeatured, setTFeatured] = useState(false);

  // FAQ form state
  const [fQuestionEn, setFQuestionEn] = useState("");
  const [fQuestionFr, setFQuestionFr] = useState("");
  const [fAnswerEn, setFAnswerEn] = useState("");
  const [fAnswerFr, setFAnswerFr] = useState("");
  const [fCategory, setFCategory] = useState("General");
  const [fSortOrder, setFSortOrder] = useState(1);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    try {
      const [testimonialsRes, faqsRes] = await Promise.all([
        supabase.from("testimonials").select("*").order("sort_order"),
        supabase.from("faqs").select("*").order("sort_order"),
      ]);
      setTestimonials(testimonialsRes.data || []);
      setFaqs(faqsRes.data || []);
    } catch (err) {
      console.error("Error fetching content:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddTestimonial = async () => {
    if (!tName.trim() || !tQuote.trim()) return;
    const supabase = createClient();
    setSaving(true);
    try {
      const maxSort = testimonials.length > 0
        ? Math.max(...testimonials.map((t) => t.sort_order || 0))
        : 0;
      const { error } = await supabase.from("testimonials").insert({
        name: tName.trim(),
        role: tRole.trim(),
        group_name: tGroup.trim(),
        quote: tQuote.trim(),
        featured: tFeatured,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
      setTestimonialDialogOpen(false);
      setTName("");
      setTRole("");
      setTGroup("");
      setTQuote("");
      setTFeatured(false);
      await fetchData();
    } catch (err) {
      console.error("Error adding testimonial:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFeatured = async (id: string, current: boolean) => {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("testimonials")
        .update({ featured: !current })
        .eq("id", id);
      if (error) throw error;
      setTestimonials((prev) =>
        prev.map((t) => (t.id === id ? { ...t, featured: !current } : t))
      );
    } catch (err) {
      console.error("Error toggling featured:", err);
    }
  };

  const handleAddFaq = async () => {
    if (!fQuestionEn.trim() || !fAnswerEn.trim()) return;
    const supabase = createClient();
    setSaving(true);
    try {
      const { error } = await supabase.from("faqs").insert({
        question_en: fQuestionEn.trim(),
        question_fr: fQuestionFr.trim(),
        answer_en: fAnswerEn.trim(),
        answer_fr: fAnswerFr.trim(),
        category: fCategory,
        sort_order: fSortOrder,
      });
      if (error) throw error;
      setFaqDialogOpen(false);
      setFQuestionEn("");
      setFQuestionFr("");
      setFAnswerEn("");
      setFAnswerFr("");
      setFCategory("General");
      setFSortOrder(1);
      await fetchData();
    } catch (err) {
      console.error("Error adding FAQ:", err);
    } finally {
      setSaving(false);
    }
  };

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
        <h1 className="text-2xl font-bold tracking-tight">{t("content")}</h1>
        <p className="text-sm text-muted-foreground">{t("contentSubtitle")}</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="testimonials">
        <TabsList>
          <TabsTrigger value="testimonials">
            <MessageSquareQuote className="mr-1.5 h-3.5 w-3.5" />
            {t("testimonials")}
          </TabsTrigger>
          <TabsTrigger value="faqs">
            <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
            {t("faqs")}
          </TabsTrigger>
        </TabsList>

        {/* Testimonials Tab */}
        <TabsContent value="testimonials" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Dialog open={testimonialDialogOpen} onOpenChange={setTestimonialDialogOpen}>
              <DialogTrigger
                render={
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t("addTestimonial")}
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t("addTestimonial")}</DialogTitle>
                  <DialogDescription>{t("addTestimonialDescription")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("testimonialName")}</Label>
                      <Input
                        placeholder="John Doe"
                        value={tName}
                        onChange={(e) => setTName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("testimonialRole")}</Label>
                      <Input
                        placeholder="President"
                        value={tRole}
                        onChange={(e) => setTRole(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("testimonialGroup")}</Label>
                    <Input
                      placeholder="Group name"
                      value={tGroup}
                      onChange={(e) => setTGroup(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("testimonialQuote")}</Label>
                    <Textarea
                      rows={4}
                      value={tQuote}
                      onChange={(e) => setTQuote(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={tFeatured}
                      onCheckedChange={setTFeatured}
                    />
                    <Label>{t("featuredToggle")}</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddTestimonial} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("addTestimonial")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {testimonials.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
                {t("noDataYet")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {testimonials.map((item) => (
                <Card key={item.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.role} &middot; {item.group_name}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleFeatured(item.id, item.featured)}
                        className="shrink-0"
                      >
                        {item.featured ? (
                          <Badge className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 cursor-pointer">
                            <Star className="h-3 w-3" />
                            {t("featured")}
                          </Badge>
                        ) : (
                          <Badge className="gap-1 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 cursor-pointer">
                            <Star className="h-3 w-3" />
                            {t("featured")}
                          </Badge>
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      &ldquo;{item.quote}&rdquo;
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* FAQs Tab */}
        <TabsContent value="faqs" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Dialog open={faqDialogOpen} onOpenChange={setFaqDialogOpen}>
              <DialogTrigger
                render={
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t("addFaq")}
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{t("addFaq")}</DialogTitle>
                  <DialogDescription>{t("addFaqDescription")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>{t("questionEn")}</Label>
                    <Input
                      value={fQuestionEn}
                      onChange={(e) => setFQuestionEn(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("questionFr")}</Label>
                    <Input
                      value={fQuestionFr}
                      onChange={(e) => setFQuestionFr(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("answerEn")}</Label>
                    <Textarea
                      rows={3}
                      value={fAnswerEn}
                      onChange={(e) => setFAnswerEn(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("answerFr")}</Label>
                    <Textarea
                      rows={3}
                      value={fAnswerFr}
                      onChange={(e) => setFAnswerFr(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("category")}</Label>
                      <Select value={fCategory} onValueChange={(val) => val && setFCategory(val)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("category")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="General">{t("faqGeneral")}</SelectItem>
                          <SelectItem value="Billing">{t("faqBilling")}</SelectItem>
                          <SelectItem value="Security">{t("faqSecurity")}</SelectItem>
                          <SelectItem value="Features">{t("faqFeatures")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("sortOrder")}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={fSortOrder}
                        onChange={(e) => setFSortOrder(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddFaq} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("addFaq")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {faqs.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-8 text-muted-foreground">
                {t("noDataYet")}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {faqs.map((faq) => (
                <Card key={faq.id}>
                  <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{faq.question_en}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {faq.answer_en}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-7 sm:pl-0">
                      <Badge className={categoryColors[faq.category] || categoryColors.General}>
                        {t(`faq${faq.category}`)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        #{faq.sort_order}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
