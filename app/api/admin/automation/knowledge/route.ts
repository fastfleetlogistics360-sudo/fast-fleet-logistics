import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { hasAutomationPermission } from "@/lib/automation/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const categories = ["company", "delivery", "marketplace", "shopping", "fast_errand", "rider", "vendor", "storage", "heavy_logistics", "support", "policy"] as const;
const statuses = ["draft", "published", "archived"] as const;
const text = (value: unknown, length: number) => typeof value === "string" ? value.trim().slice(0, length) : "";

export async function GET(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  if (!(await hasAutomationPermission(admin.userId, "operator"))) return NextResponse.json({ error: "FAST AI operator permission required." }, { status: 403 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "FAST AI knowledge is unavailable." }, { status: 503 });
  const { data, error } = await db.from("fast_ai_knowledge_entries").select("id, slug, category, title, body, source_metadata, version, status, created_at, updated_at").order("updated_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: "FAST AI knowledge is unavailable." }, { status: 503 });
  return NextResponse.json({ entries: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  if (!(await hasAutomationPermission(admin.userId, "operator"))) return NextResponse.json({ error: "FAST AI operator permission required." }, { status: 403 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const slug = text(body?.slug, 100).toLowerCase(); const category = text(body?.category, 40); const title = text(body?.title, 180); const entryBody = text(body?.body, 5000); const status = text(body?.status, 20) || "draft";
  if (!/^[a-z0-9][a-z0-9-]{1,100}$/.test(slug) || !categories.includes(category as typeof categories[number]) || title.length < 2 || entryBody.length < 10 || !statuses.includes(status as typeof statuses[number])) return NextResponse.json({ error: "Provide a valid slug, category, title, body, and status." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "FAST AI knowledge is unavailable." }, { status: 503 });
  const { data: latest } = await db.from("fast_ai_knowledge_entries").select("version").eq("slug", slug).order("version", { ascending: false }).limit(1).maybeSingle<{ version: number }>();
  const candidateMetadata = body?.sourceMetadata && typeof body.sourceMetadata === "object" && !Array.isArray(body.sourceMetadata) ? body.sourceMetadata : {};
  const sourceMetadata = JSON.stringify(candidateMetadata).length <= 2_000 ? candidateMetadata : {};
  const { data, error } = await db.from("fast_ai_knowledge_entries").insert({ slug, category, title, body: entryBody, source_metadata: sourceMetadata, version: Number(latest?.version || 0) + 1, status, created_by: admin.userId, updated_by: admin.userId }).select("id, slug, category, title, body, source_metadata, version, status, created_at, updated_at").single();
  if (error) return NextResponse.json({ error: "FAST AI knowledge could not be saved." }, { status: 503 });
  return NextResponse.json({ entry: data }, { status: 201 });
}
