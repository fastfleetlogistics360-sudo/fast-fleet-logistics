import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { campusProgramSettingsKey, DEFAULT_CAMPUS_PROGRAM, normalizeCampusProgram } from "@/lib/campus-program";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ program: DEFAULT_CAMPUS_PROGRAM, users: [], demo: true });

  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() || "";
  const [{ data, error }, usersResult] = await Promise.all([
    db.from("platform_settings").select("value").eq("key", campusProgramSettingsKey).maybeSingle<{ value?: unknown | null }>(),
    query.length >= 2
      ? db.from("users").select("id, full_name, email, phone, role").or(`full_name.ilike.%${escapeFilter(query)}%,email.ilike.%${escapeFilter(query)}%,phone.ilike.%${escapeFilter(query)}%`).limit(12)
      : Promise.resolve({ data: [] })
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ program: normalizeCampusProgram(data?.value), users: usersResult.data || [] });
}

export async function PUT(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request, "destructive");
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const program = normalizeCampusProgram(body);
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to save the campus programme." }, { status: 503 });

  const enrollments = program.lecturerEnrollments.map((entry) => ({ ...entry, addedAt: entry.addedAt || new Date().toISOString(), addedBy: entry.addedBy || admin.userId }));
  const value = { ...program, lecturerEnrollments: enrollments };
  const { data, error } = await db
    .from("platform_settings")
    .upsert({ key: campusProgramSettingsKey, value: value as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("value")
    .single<{ value?: unknown | null }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ program: normalizeCampusProgram(data?.value) });
}

function escapeFilter(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}
