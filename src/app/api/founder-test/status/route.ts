import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.FOUNDER_TEST_MODE !== "true") {
    return NextResponse.json({ founderTestMode: false }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const expectedProjectRef = process.env.FOUNDER_TEST_SUPABASE_REF ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  let actualProjectRef = "";
  try {
    actualProjectRef = new URL(supabaseUrl).hostname.split(".")[0] ?? "";
  } catch {
    actualProjectRef = "";
  }

  const bindingMatches =
    expectedProjectRef.length > 0 && actualProjectRef === expectedProjectRef;
  let serviceCredentialVerified = false;

  if (bindingMatches && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin
      .from("groups")
      .select("id", { count: "exact", head: true })
      .limit(1);
    serviceCredentialVerified = !error;
  }

  const ready = bindingMatches && serviceCredentialVerified;
  return NextResponse.json(
    {
      founderTestMode: true,
      bindingMatches,
      serviceCredentialVerified,
      externalDeliverySuppressed: true,
      scheduledSideEffectsSuppressed: !process.env.CRON_SECRET,
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
