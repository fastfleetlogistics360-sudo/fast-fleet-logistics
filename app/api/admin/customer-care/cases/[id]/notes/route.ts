import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/support/cases";
import { recordSupportEvent } from "@/lib/support/events";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  const body = await request.json().catch(() => ({})); const note = typeof body.body === "string" ? body.body.trim() : "";
  if (note.length < 2 || note.length > 2_000) return NextResponse.json({ error: "Notes must contain between 2 and 2,000 characters." }, { status: 400 });
  const db = createAdminClient(); if (!db) return NextResponse.json({ error: "Customer Care is temporarily unavailable." }, { status: 503 });
  const { data: supportCase } = await db.from("support_tickets").select("id").eq("id", id).maybeSingle();
  if (!supportCase) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const { data, error } = await db.from("support_messages").insert({ ticket_id: id, sender_type: "admin", sender_user_id: admin.userId, body: note, visibility: "internal", message_type: "note" }).select("id, sender_type, body, created_at, visibility, message_type").single();
  if (error) return NextResponse.json({ error: "Could not save the internal note." }, { status: 503 });
  await db.from("support_tickets").update({ last_activity_at: new Date().toISOString() }).eq("id", id);
  await recordSupportEvent(db, { ticketId: id, actorUserId: admin.userId, actorType: "agent", eventType: "INTERNAL_NOTE" });
  return NextResponse.json({ note: data });
}
