import { NextResponse } from "next/server";
import { normalizeState } from "@/lib/launch-states";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function clean(value: unknown, maxLength = 180) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const state = normalizeState(clean(body.state, 80));
    const businessName = clean(body.business_name, 140);
    const pickupAddress = sanitizeAddressText(clean(body.pickup_address, 260));
    const contactName = clean(body.contact_name, 120);
    const phone = clean(body.phone, 40);
    const email = clean(body.email, 180);
    const businessType = clean(body.business_type, 80);
    const cacNumber = clean(body.cac_number, 80);

    if (!state) return NextResponse.json({ error: "Select the state where this business operates." }, { status: 400 });
    if (businessName.length < 3 || pickupAddress.length < 5) {
      return NextResponse.json({ error: "Business name and pickup address are required." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to save your business profile." }, { status: 401 });

    const db = createAdminClient() || supabase;
    const { data: current, error: currentError } = await db
      .from("business_profiles")
      .select("id, user_id, registration_status")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; user_id: string; registration_status?: string | null }>();
    if (currentError) throw currentError;
    if (!current?.id) return NextResponse.json({ error: "Business profile was not found." }, { status: 404 });

    const now = new Date().toISOString();
    let { data, error } = await db
      .from("business_profiles")
      .update({
        business_name: businessName,
        contact_name: contactName || null,
        phone: phone || null,
        email: email || user.email || null,
        industry: businessType || null,
        business_type: businessType || null,
        operating_state: state,
        pickup_address: pickupAddress,
        cac_number: cacNumber || null,
        updated_at: now
      })
      .eq("id", current.id)
      .select("id, business_name, contact_name, phone, email, industry, business_type, commission_rate, operating_state, pickup_address, cac_number, registration_status, rejection_reason")
      .maybeSingle();
    if (error) {
      const fallback = await db
        .from("business_profiles")
        .update({
          business_name: businessName,
          contact_name: contactName || null,
          phone: phone || null,
          email: email || user.email || null,
          industry: businessType || null,
          business_type: businessType || null,
          pickup_address: pickupAddress,
          cac_number: cacNumber || null,
          updated_at: now
        })
        .eq("id", current.id)
        .select("id, business_name, contact_name, phone, email, industry, business_type, commission_rate, pickup_address, cac_number, registration_status, rejection_reason")
        .maybeSingle();
      data = fallback.data ? { ...fallback.data, operating_state: state } : null;
      error = fallback.error;
    }
    if (error) throw error;

    await Promise.allSettled([
      db.from("users").update({ full_name: contactName || businessName, phone: phone || null, email: email || user.email || null, default_zone: state, updated_at: now }).eq("id", user.id),
      db.from("profiles").update({ full_name: contactName || businessName, phone: phone || null, email: email || user.email || null, updated_at: now }).eq("user_id", user.id)
    ]);

    return NextResponse.json({ profile: { ...(data || {}), operating_state: state, default_zone: state } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save business profile." }, { status: 500 });
  }
}
