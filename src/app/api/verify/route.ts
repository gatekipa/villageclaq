import { NextResponse } from "next/server";

// Membership IDs never authorize public verification. M14's consented,
// revocable /verify-card/<opaque token> path is the only public card surface.
export async function GET() {
  return NextResponse.json(
    { error: "LEGACY_MEMBERSHIP_VERIFIER_RETIRED" },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
