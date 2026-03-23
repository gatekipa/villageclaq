"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SignupPage() {
  const t = useTranslations();

  async function handleSignup(formData: FormData) {
    // TODO: Implement Supabase signup
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    console.log("Signup:", email, password);
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">
          VC
        </div>
        <CardTitle className="text-2xl">{t("auth.createAccount")}</CardTitle>
        <CardDescription>{t("auth.signupSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* OAuth buttons */}
        <div className="grid gap-2">
          <Button variant="outline" className="w-full">
            {t("auth.continueWithGoogle")}
          </Button>
          <Button variant="outline" className="w-full">
            {t("auth.continueWithApple")}
          </Button>
          <Button variant="outline" className="w-full">
            {t("auth.continueWithPhone")}
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              {t("common.or")}
            </span>
          </div>
        </div>

        {/* Email form */}
        <form action={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">
              {t("auth.confirmPassword")}
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("auth.agreeToTerms")}
          </p>
          <Button type="submit" className="w-full">
            {t("auth.signup")}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t("auth.hasAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("auth.login")}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
