import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      reason: "OAuth provider preflight checks are disabled. Start OAuth redirects directly in the browser."
    },
    { status: 410 }
  );
}
