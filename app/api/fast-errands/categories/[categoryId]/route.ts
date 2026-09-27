import { NextResponse } from "next/server";
import { hasFastErrandAgeAccess, readFastErrandAgeAcknowledgementFromCookieHeader } from "@/lib/fast-errands-age-access";
import { loadFastErrandsCatalog } from "@/lib/fast-errands-catalog";

/** Restricted catalogue contents are loaded only after the server verifies the session acknowledgement. */
export async function GET(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const category = (await loadFastErrandsCatalog(false, true)).find((entry) => entry.id === categoryId);
  if (!category) return NextResponse.json({ error: "Collection not found." }, { status: 404 });
  const acknowledgement = readFastErrandAgeAcknowledgementFromCookieHeader(request.headers.get("cookie"));
  if (!hasFastErrandAgeAccess(acknowledgement, category.access_minimum_age)) {
    return NextResponse.json({ error: "Please confirm you are 18+ to view this collection.", code: "age_acknowledgement_required" }, { status: 403 });
  }
  return NextResponse.json({ category: { ...category, items: category.items } });
}
