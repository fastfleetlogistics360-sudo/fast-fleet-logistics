import { NextResponse } from "next/server";
import { supportAvailability } from "@/lib/support/cases";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(supportAvailability(), { headers: { "Cache-Control": "no-store" } });
}
