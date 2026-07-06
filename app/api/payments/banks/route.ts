import { NextResponse } from "next/server";
import { squadBanks } from "@/lib/payments/squad";

export async function GET() {
  return NextResponse.json({ banks: squadBanks });
}
