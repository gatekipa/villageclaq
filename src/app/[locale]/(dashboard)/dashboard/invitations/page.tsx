"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Link2,
  Copy,
  Check,
  QrCode,
  Mail,
  Phone,
  Send,
  RefreshCw,
  Clock,
  UserPlus,
  Download,
  MoreVertical,
  XCircle,
  RotateCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mockJoinCode = {
  code: "VCQ-8A3F7B2D",
  link: "https://villageclaq.com/join/VCQ-8A3F7B2D",
  usedCount: 5,
  maxUses: null,
  expiresAt: null,
  isActive: true,
};

const pendingInvitations = [
  { id: "1", email: "alice.nkembe@email.com", phone: null, sentBy: "Cyril Ndonwi", sentOn: "2026-03-18", expiresOn: "2026-03-25", status: "pending" },
  { id: "2", email: null, phone: "+237 699 888 777", sentBy: "Cyril Ndonwi", sentOn: "2026-03-15", expiresOn: "2026-03-22", status: "pending" },
  { id: "3", email: "bruno.fotso@email.com", phone: null, sentBy: "Jean-Pierre Kamga", sentOn: "2026-03-10", expiresOn: "2026-03-17", status: "expired" },
  { id: "4", email: "diane.ngassa@email.com", phone: null, sentBy: "Cyril Ndonwi", sentOn: "2026-03-05", expiresOn: "2026-03-12", status: "accepted" },
];

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  declined: "bg-red-500/10 text-red-700 dark:text-red-400",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function InvitationsPage() {
  const t = useTranslations();
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  function copyToClipboard(text: string, type: "code" | "link") {
    navigator.clipboard.writeText(text);
    if (type === "code") {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } else {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("invitations.title")}</h1>
        <p className="text-muted-foreground">{t("invitations.subtitle")}</p>
      </div>

      <Tabs defaultValue="link">
        <TabsList>
          <TabsTrigger value="link">
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            {t("invitations.inviteByLink")}
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            {t("invitations.inviteByEmail")}
          </TabsTrigger>
          <TabsTrigger value="phone">
            <Phone className="mr-1.5 h-3.5 w-3.5" />
            {t("invitations.inviteByPhone")}
          </TabsTrigger>
        </TabsList>

        {/* Invite by Link */}
        <TabsContent value="link" className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Join Code */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserPlus className="h-4 w-4" />
                  {t("invitations.joinCode")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6">
                  <span className="text-2xl font-mono font-bold tracking-widest text-primary">
                    {mockJoinCode.code}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => copyToClipboard(mockJoinCode.code, "code")}
                  >
                    {codeCopied ? <Check className="mr-2 h-4 w-4 text-primary" /> : <Copy className="mr-2 h-4 w-4" />}
                    {codeCopied ? t("common.copied") : t("invitations.copyCode")}
                  </Button>
                  <Button variant="outline" size="icon">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("invitations.usedCount", { count: mockJoinCode.usedCount })}</span>
                  <span>{t("invitations.unlimitedUses")}</span>
                </div>
              </CardContent>
            </Card>

            {/* Join Link */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="h-4 w-4" />
                  {t("invitations.joinLink")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="break-all text-sm font-mono text-muted-foreground">
                    {mockJoinCode.link}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => copyToClipboard(mockJoinCode.link, "link")}
                >
                  {linkCopied ? <Check className="mr-2 h-4 w-4 text-primary" /> : <Copy className="mr-2 h-4 w-4" />}
                  {linkCopied ? t("common.copied") : t("invitations.copyLink")}
                </Button>

                <Separator />

                {/* QR Code */}
                <div className="text-center">
                  <p className="mb-3 text-sm font-medium">{t("invitations.qrCode")}</p>
                  <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-xl border-2 bg-white p-4">
                    {/* SVG QR Code placeholder - real QR generation would use a library */}
                    <svg viewBox="0 0 200 200" className="h-full w-full">
                      {/* QR pattern - simplified visual representation */}
                      <rect x="0" y="0" width="200" height="200" fill="white"/>
                      {/* Position markers */}
                      <rect x="10" y="10" width="50" height="50" fill="black"/>
                      <rect x="15" y="15" width="40" height="40" fill="white"/>
                      <rect x="20" y="20" width="30" height="30" fill="black"/>
                      <rect x="140" y="10" width="50" height="50" fill="black"/>
                      <rect x="145" y="15" width="40" height="40" fill="white"/>
                      <rect x="150" y="20" width="30" height="30" fill="black"/>
                      <rect x="10" y="140" width="50" height="50" fill="black"/>
                      <rect x="15" y="145" width="40" height="40" fill="white"/>
                      <rect x="20" y="150" width="30" height="30" fill="black"/>
                      {/* Data modules - decorative pattern */}
                      {[70,80,90,100,110,120,130].map((x) =>
                        [10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180].map((y) => (
                          (x + y) % 30 === 0 || (x * y) % 17 < 8 ? (
                            <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" fill="black"/>
                          ) : null
                        ))
                      )}
                      {[10,20,30,40,50,60].map((y) =>
                        [70,80,90,100,110,120,130].map((x) => (
                          (x + y) % 20 === 0 || (x * y) % 13 < 6 ? (
                            <rect key={`d-${x}-${y}`} x={x} y={y} width="8" height="8" fill="black"/>
                          ) : null
                        ))
                      )}
                      {[140,150,160,170,180].map((y) =>
                        [70,80,90,100,110,120,130].map((x) => (
                          (x + y) % 22 === 0 || (x * y) % 11 < 5 ? (
                            <rect key={`e-${x}-${y}`} x={x} y={y} width="8" height="8" fill="black"/>
                          ) : null
                        ))
                      )}
                      {/* Timing patterns */}
                      {[70,90,110,130].map((pos) => (
                        <rect key={`th-${pos}`} x={pos} y="65" width="8" height="8" fill="black"/>
                      ))}
                      {[70,90,110,130].map((pos) => (
                        <rect key={`tv-${pos}`} x="65" y={pos} width="8" height="8" fill="black"/>
                      ))}
                    </svg>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-3">
                    <Download className="mr-2 h-4 w-4" />
                    {t("invitations.downloadQR")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Invite by Email */}
        <TabsContent value="email" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                {t("invitations.inviteByEmail")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("auth.email")}</Label>
                <div className="flex gap-2">
                  <Input type="email" placeholder="member@example.com" className="flex-1" />
                  <Button>
                    <Send className="mr-2 h-4 w-4" />
                    {t("common.submit")}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("invitations.inviteSent")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invite by Phone */}
        <TabsContent value="phone" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Phone className="h-4 w-4" />
                {t("invitations.inviteByPhone")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("auth.phoneNumber")}</Label>
                <div className="flex gap-2">
                  <Input type="tel" placeholder="+237 6XX XXX XXX" className="flex-1" />
                  <Button>
                    <Send className="mr-2 h-4 w-4" />
                    {t("common.submit")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pending Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            {t("invitations.pendingInvitations")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingInvitations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("invitations.noInvitations")}
            </p>
          ) : (
            <div className="space-y-3">
              {pendingInvitations.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      {invite.email ? <Mail className="h-4 w-4 text-muted-foreground" /> : <Phone className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {invite.email || invite.phone}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("invitations.sentBy")} {invite.sentBy} &middot; {invite.sentOn}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-[52px] sm:pl-0">
                    <Badge className={statusStyles[invite.status]}>
                      {t(`invitations.${invite.status}` as "invitations.pending")}
                    </Badge>
                    {invite.status === "pending" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent focus:outline-none">
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="flex items-center gap-2">
                            <RotateCw className="h-3.5 w-3.5" />
                            {t("invitations.resendInvite")}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="flex items-center gap-2 text-destructive">
                            <XCircle className="h-3.5 w-3.5" />
                            {t("invitations.revokeInvite")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
