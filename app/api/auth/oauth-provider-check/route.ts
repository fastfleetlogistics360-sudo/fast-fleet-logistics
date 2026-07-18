import { NextResponse } from "next/server";

// rate-limit-exempt: This disabled compatibility endpoint performs no
// authentication, persistence, provider call, or other costly work.

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      reason: "OAuth provider preflight checks are disabled. Start OAuth redirects directly in the browser."
    },
    { status: 410 }
  );
}
