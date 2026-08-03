import { NextResponse } from "next/server";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAddressText } from "@/lib/location/address-formatting";

const categories = new Set(["building_materials", "furniture", "office_equipment", "farm_produce", "bulk_goods", "other_heavy_items"]);
const accessOptions = new Set(["easy", "narrow", "roadside_transfer", "not_sure"]);

type Payload = {
  category?: string;
  itemType?: string;
  quantity?: string;
  pickup?: string;
  pickupAccess?: string;
  dropoff?: string;
  dropoffAccess?: string;
  contactName?: string;
  contactPhone?: string;
  preferredPickupAt?: string;
  instructions?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before submitting a request." }, { status: 401 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.heavyLogisticsRequest);
    if (limited) return limited;

    const payload = (await request.json().catch(() => ({}))) as Payload;
    const category = clean(payload.category, 60);
    const itemType = clean(payload.itemType, 80);
    const quantity = clean(payload.quantity, 100);
    const pickup = sanitizeAddressText(clean(payload.pickup, 300));
    const dropoff = sanitizeAddressText(clean(payload.dropoff, 300));
    const pickupAccess = clean(payload.pickupAccess, 40) || "not_sure";
    const dropoffAccess = clean(payload.dropoffAccess, 40) || "not_sure";
    const contactName = clean(payload.contactName, 100);
    const contactPhone = clean(payload.contactPhone, 30);
    const instructions = clean(payload.instructions, 800) || null;
    const preferredPickupAt = parseDate(payload.preferredPickupAt);

    if (!categories.has(category) || !itemType || !quantity || !pickup || !dropoff || !contactName || contactPhone.length < 10 || !preferredPickupAt) {
      return NextResponse.json({ error: "Complete all required fields." }, { status: 400 });
    }
    if (!accessOptions.has(pickupAccess) || !accessOptions.has(dropoffAccess)) return NextResponse.json({ error: "Choose valid access details." }, { status: 400 });

    const admin = createAdminClient();
    const db = admin || supabase;
    const requestCode = `HL-${Date.now().toString().slice(-8)}-${Math.floor(10 + Math.random() * 90)}`;
    const { data: heavyRequest, error } = await db
      .from("heavy_logistics_requests")
      .insert({
        request_code: requestCode,
        customer_id: user.id,
        category,
        item_type: itemType,
        quantity,
        pickup_address: pickup,
        pickup_access: pickupAccess,
        dropoff_address: dropoff,
        dropoff_access: dropoffAccess,
        contact_name: contactName,
        contact_phone: contactPhone,
        preferred_pickup_at: preferredPickupAt,
        instructions,
        status: "submitted"
      })
      .select("id, request_code, status")
      .single();
    if (error) throw error;

    if (admin) {
      const { data: admins } = await admin.from("profiles").select("user_id").eq("is_admin", true).is("deleted_at", null);
      await Promise.allSettled((admins || []).map((profile: { user_id: string }) => insertNotificationWithPush(admin, {
        user_id: profile.user_id,
        title: "Heavy logistics request",
        body: `${heavyRequest.request_code} · ${itemType} · ${quantity}`,
        type: "heavy_logistics_request",
        metadata: { heavy_logistics_request_id: heavyRequest.id, request_code: heavyRequest.request_code, url: "/admin/heavy-logistics", tag: `ff-heavy-${heavyRequest.request_code}` }
      })));
    }

    return NextResponse.json({ request: heavyRequest }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not submit request." }, { status: 500 });
  }
}

function clean(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function parseDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
