"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  MessageSquareQuote,
  HelpCircle,
  Plus,
  Star,
  GripVertical,
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

interface Testimonial {
  id: string;
  name: string;
  role: string;
  group: string;
  quote: string;
  featured: boolean;
}

interface Faq {
  id: string;
  questionEn: string;
  answerPreview: string;
  category: string;
  sortOrder: number;
}

const mockTestimonials: Testimonial[] = [
  {
    id: "1",
    name: "Marie Tabi",
    role: "President",
    group: "Bamenda Alumni Union",
    quote: "VillageClaq transformed how we manage our njangi contributions. Everything is transparent and members trust the system.",
    featured: true,
  },
  {
    id: "2",
    name: "Emmanuel Fon",
    role: "Treasurer",
    group: "Douala Business Network",
    quote: "The financial tracking is exactly what our group needed. We reduced disputes by 90% in the first month.",
    featured: true,
  },
  {
    id: "3",
    name: "Grace Nkembe",
    role: "Secretary",
    group: "Buea Tech Community",
    quote: "Managing events and member communications used to take hours. Now it takes minutes with VillageClaq.",
    featured: false,
  },
  {
    id: "4",
    name: "Samuel Ngwa",
    role: "Member",
    group: "Limbe Fishermen Njangi",
    quote: "I can finally see all my contributions and savings in one place. The mobile experience is fantastic.",
    featured: false,
  },
];

const mockFaqs: Faq[] = [
  {
    id: "1",
    questionEn: "How do I create a group on VillageClaq?",
    answerPreview: "Sign up, click Create Group, fill in details...",
    category: "General",
    sortOrder: 1,
  },
  {
    id: "2",
    questionEn: "What payment methods are supported?",
    answerPreview: "We support Mobile Money, bank transfers...",
    category: "Billing",
    sortOrder: 2,
  },
  {
    id: "3",
    questionEn: "Is my financial data secure?",
    answerPreview: "All data is encrypted at rest and in transit...",
    category: "Security",
    sortOrder: 3,
  },
  {
    id: "4",
    questionEn: "Can I belong to multiple groups?",
    answerPreview: "Yes, VillageClaq supports multi-group membership...",
    category: "Features",
    sortOrder: 4,
  },
  {
    id: "5",
    questionEn: "How do I upgrade my group's plan?",
    answerPreview: "Go to Settings > Subscription and select a new plan...",
    category: "Billing",
    sortOrder: 5,
  },
  {
    id: "6",
    questionEn: "What happens when a member misses a contribution?",
    answerPreview: "The system flags the missed payment and notifies...",
    category: "Features",
    sortOrder: 6,
  },
];

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
                      <Input placeholder="John Doe" />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("testimonialRole")}</Label>
                      <Input placeholder="President" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("testimonialGroup")}</Label>
                    <Input placeholder="Group name" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("testimonialQuote")}</Label>
                    <Textarea rows={4} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch />
                    <Label>{t("featuredToggle")}</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setTestimonialDialogOpen(false)}>
                    {t("addTestimonial")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {mockTestimonials.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.role} &middot; {item.group}
                      </p>
                    </div>
                    {item.featured && (
                      <Badge className="shrink-0 gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <Star className="h-3 w-3" />
                        {t("featured")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
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
                    <Input />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("questionFr")}</Label>
                    <Input />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("answerEn")}</Label>
                    <Textarea rows={3} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("answerFr")}</Label>
                    <Textarea rows={3} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("category")}</Label>
                      <Select>
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
                      <Input type="number" min={1} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setFaqDialogOpen(false)}>
                    {t("addFaq")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3">
            {mockFaqs.map((faq) => (
              <Card key={faq.id}>
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{faq.questionEn}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {faq.answerPreview}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-7 sm:pl-0">
                    <Badge className={categoryColors[faq.category]}>
                      {t(`faq${faq.category}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      #{faq.sortOrder}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
