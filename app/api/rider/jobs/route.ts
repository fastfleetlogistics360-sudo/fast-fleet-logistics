import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryStatus } from "@/types/domain";

const statusFlow: Record<string, DeliveryStatus> = {
  accepted: "rider_arrived",
  rider_arrived: "picked_up",
  picked_up: "delivered",
  in_transit: "delivered"
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();
    if (!id || !["accept", "decline", "advance"].includes(action)) {
      return NextResponse.json({ error: "Choose a job and valid rider action." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    if (action === "accept") {
      const { error } = await supabase.rpc("accept_delivery_offer", { target_delivery_id: id });
      if (error) throw error;
      return updateResponse(supabase, id);
    }

    if (action === "decline") {
      const { error } = await supabase.rpc("reject_delivery_offer", { target_delivery_id: id });
      if (error) throw error;
      return NextResponse.json({ ok: true, declined: id });
    }

    const { data: current, error: currentError } = await supabase
      .from("deliveries")
      .select("id, status, rider_profiles(user_id)")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;

    const riderProfiles = current.rider_profiles as { user_id?: string | null } | null;
    if (riderProfiles?.user_id !== user.id) {
      return NextResponse.json({ error: "Only the assigned rider can update this delivery." }, { status: 403 });
    }

    const nextStatus = statusFlow[String(current.status)] || "delivered";
    const timestamp = new Date().toISOString();
    const patch: Record<string, unknown> = { status: nextStatus, updated_at: timestamp };
    if (nextStatus === "picked_up") patch.picked_up_at = timestamp;
    if (nextStatus === "delivered") patch.delivered_at = timestamp;

    const { error: updateError } = await supabase.from("deliveries").update(patch).eq("id", id);
    if (updateError) throw updateError;

    await supabase.from("delivery_events").insert({
      delivery_id: id,
      actor_id: user.id,
      status: nextStatus,
      title: nextStatus.replaceAll("_", " "),
      body: "Rider updated this delivery."
    });

    return updateResponse(supabase, id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update rider job." }, { status: 500 });
  }
}

async function updateResponse(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, distance_km, eta_minutes, created_at, proof_url")
    .eq("id", id)
    .single();
  if (error) throw error;
  return NextResponse.json({ job: data });
}
