import { NextRequest, NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient(); if (!db) return NextResponse.json({ error: "Operations data is not configured." }, { status: 503 });
  try {
    const [memberships, vendors] = await Promise.all([
      db.from("marketplace_operator_memberships").select("id, user_id, marketplace_vendor_id, role, all_vendors, active, revoked_at, created_at, users:users!marketplace_operator_memberships_user_id_fkey(full_name, email, phone), marketplace_vendors(id, display_name)").order("created_at", { ascending: false }).limit(200),
      db.from("marketplace_vendors").select("id, display_name, lifecycle_status").eq("operational_mode", "fastfleet_managed").eq("managed_by_fastfleet", true).order("display_name", { ascending: true }).limit(200)
    ]);
    if (memberships.error || vendors.error) throw memberships.error || vendors.error;
    return NextResponse.json({ memberships: memberships.data || [], vendors: vendors.data || [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Operations Team." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request); if (limited) return limited;
  const db = createAdminClient(); if (!db) return NextResponse.json({ error: "Operations data is not configured." }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "revoke" || action === "reactivate") return changeLifecycle(db, admin.userId, String(body.membershipId || ""), action);
    if (action !== "save") return NextResponse.json({ error: "Unknown membership action." }, { status: 400 });
    const role = String(body.role || ""); const allVendors = body.allVendors === true; const vendorIds = Array.from(new Set(Array.isArray(body.vendorIds) ? body.vendorIds.map(String).filter(Boolean) : []));
    if (role !== "operator" && role !== "manager") return NextResponse.json({ error: "Choose an existing Marketplace role." }, { status: 400 });
    if (!allVendors && !vendorIds.length) return NextResponse.json({ error: "Choose all managed vendors or at least one durable vendor record." }, { status: 400 });
    const userId = await resolveUserId(db, String(body.userId || ""), String(body.userQuery || "")); if (!userId) return NextResponse.json({ error: "Choose an existing user account." }, { status: 400 });
    const { data: managedVendors, error: vendorError } = await db.from("marketplace_vendors").select("id").eq("operational_mode", "fastfleet_managed").eq("managed_by_fastfleet", true).in("id", vendorIds);
    if (vendorError) throw vendorError; if (!allVendors && managedVendors?.length !== vendorIds.length) return NextResponse.json({ error: "One or more selected vendors are not Fast Fleets-managed vendors." }, { status: 400 });
    const { data: previous, error: previousError } = await db.from("marketplace_operator_memberships").select("id, role, all_vendors, marketplace_vendor_id, active, revoked_at").eq("user_id", userId).eq("active", true).is("revoked_at", null);
    if (previousError) throw previousError;
    // Replacing scopes is a durable revoke-plus-grant operation. The old rows
    // stay auditable and Phase 2 immediately stops recognizing their scope.
    if (previous?.length) { const { error } = await db.from("marketplace_operator_memberships").update({ active: false, revoked_at: new Date().toISOString(), revoked_by: admin.userId }).eq("user_id", userId).eq("active", true).is("revoked_at", null); if (error) throw error; }
    const rows = allVendors ? [{ user_id: userId, role, all_vendors: true, marketplace_vendor_id: null, active: true, granted_by: admin.userId, revoked_at: null, revoked_by: null }] : vendorIds.map((marketplace_vendor_id) => ({ user_id: userId, role, all_vendors: false, marketplace_vendor_id, active: true, granted_by: admin.userId, revoked_at: null, revoked_by: null }));
    const { data: next, error: insertError } = await db.from("marketplace_operator_memberships").insert(rows as any).select("id, role, all_vendors, marketplace_vendor_id"); if (insertError) throw insertError;
    await audit(db, admin.userId, userId, previous || [], next || [], previous?.length ? "operator_membership_replaced" : "operator_membership_granted");
    return NextResponse.json({ ok: true, memberships: next || [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save operator access." }, { status: 400 }); }
}

async function changeLifecycle(db: NonNullable<ReturnType<typeof createAdminClient>>, actorUserId: string, membershipId: string, action: "revoke" | "reactivate") {
  if (!membershipId) return NextResponse.json({ error: "Membership is required." }, { status: 400 });
  const { data: current, error } = await db.from("marketplace_operator_memberships").select("id, user_id, role, all_vendors, marketplace_vendor_id, active, revoked_at").eq("id", membershipId).maybeSingle(); if (error) throw error; if (!current) return NextResponse.json({ error: "Membership not found." }, { status: 404 });
  const nextState = action === "revoke" ? { active: false, revoked_at: new Date().toISOString(), revoked_by: actorUserId } : { active: true, revoked_at: null, revoked_by: null, granted_by: actorUserId };
  const { data: updated, error: updateError } = await db.from("marketplace_operator_memberships").update(nextState).eq("id", membershipId).select("id, role, all_vendors, marketplace_vendor_id, active, revoked_at").single(); if (updateError) throw updateError;
  await audit(db, actorUserId, current.user_id, [current], [updated], action === "revoke" ? "operator_membership_revoked" : "operator_membership_reactivated");
  return NextResponse.json({ ok: true, membership: updated });
}

async function resolveUserId(db: NonNullable<ReturnType<typeof createAdminClient>>, requestedId: string, userQuery: string) {
  if (requestedId) { const { data } = await db.from("users").select("id").eq("id", requestedId).maybeSingle<{ id: string }>(); return data?.id || null; }
  const email = userQuery.trim().toLowerCase(); if (!email || email.length > 160) return null;
  const { data } = await db.from("users").select("id").eq("email", email).maybeSingle<{ id: string }>(); return data?.id || null;
}

async function audit(db: NonNullable<ReturnType<typeof createAdminClient>>, actorUserId: string, targetUserId: string, previous: unknown, next: unknown, action: string) {
  const { error } = await db.from("marketplace_audit_events").insert({ actor_user_id: actorUserId, actor_type: "admin", action, previous_state: { memberships: previous }, next_state: { memberships: next }, metadata: { target_user_id: targetUserId, source: "operations_team" } });
  if (error) throw error;
}
