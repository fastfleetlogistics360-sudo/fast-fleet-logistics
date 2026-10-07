import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const preferences = new Set(["full_time", "part_time", "flexible"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to apply as a cyclist." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.uploadKycSubmit);
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const area = clean(body.residentialArea, 120);
  const zone = clean(body.preferredOperatingZone, 120);
  const preference = clean(body.employmentPreference, 40);
  if (body.canRideBicycle !== true || !area || !zone || !preferences.has(preference) || body.hasSmartphone !== true || body.hasValidId !== true || body.hasGuarantor !== true) {
    return NextResponse.json({ error: "Complete the cyclist application and confirm the listed requirements." }, { status: 400 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Cyclist applications are temporarily unavailable." }, { status: 503 });
  const { data: referral } = await db.from("referrals").select("id, campaign:referral_campaigns!inner(campaign_type)").eq("referred_user_id", user.id).maybeSingle<{ id: string; campaign?: { campaign_type?: string | null } | null }>();
  const referralId = referral?.campaign?.campaign_type === "cyclist" ? referral.id : null;
  const { data, error } = await db.from("cyclist_applications").insert({
    user_id: user.id,
    referral_id: referralId,
    can_ride_bicycle: true,
    residential_area: area,
    preferred_operating_zone: zone,
    employment_preference: preference,
    has_smartphone: true,
    has_valid_id: true,
    has_guarantor: true,
    experience_notes: clean(body.experienceNotes, 1200) || null
  }).select("id, status, submitted_at").single();
  if (error) return NextResponse.json({ error: /unique/i.test(error.message) ? "You already have an active cyclist application." : error.message }, { status: 400 });
  if (referralId) {
    const { data: referrer } = await db.from("referrals").select("referrer_user_id").eq("id", referralId).maybeSingle<{ referrer_user_id?: string }>();
    if (referrer?.referrer_user_id) await db.from("notifications").insert({ user_id: referrer.referrer_user_id, title: "Cyclist referral started onboarding", body: "Your cyclist referral submitted their application. The reward stays pending until their first completed delivery.", type: "referral_cyclist_application", channel: "in_app", metadata: { cyclist_application_id: data.id, url: "/referrals" } });
  }
  return NextResponse.json({ application: data }, { status: 201 });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
