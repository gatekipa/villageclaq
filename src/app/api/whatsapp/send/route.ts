import { NextResponse } from "next/server";

/**
 * POST /api/whatsapp/send
 * Cut 2: typed, direct Meta {template,components}, and {text} branches are closed.
 * 410 GONE for every body. Raw Meta is drain-only.
 */
export async function POST() {
  return NextResponse.json(
    { error: "gone", message: "POST /api/whatsapp/send is closed. Use domain notification routes." },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "gone", message: "POST /api/whatsapp/send is closed." },
    { status: 410 },
  );
}
