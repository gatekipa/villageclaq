import { NextResponse } from "next/server";

/**
 * POST /api/sms/send
 * Cut 2: generic SMS relay is closed. 410 GONE for every body.
 * Domain producers enqueue via service_role RPC only.
 */
export async function POST() {
  return NextResponse.json(
    { error: "gone", message: "POST /api/sms/send is closed. Use domain notification routes." },
    { status: 410 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "gone", message: "POST /api/sms/send is closed." },
    { status: 410 },
  );
}
