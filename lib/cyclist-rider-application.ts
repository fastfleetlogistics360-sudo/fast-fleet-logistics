import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNotificationWithPush } from "@/lib/notifications/push";

const preferences = new Set(["full_time", "part_time", "flexible"]);
const activeCyclistStatuses = ["submitted", "screening", "assessment_invited", "assessment_passed", "approved", "rider_activated"];
const activeStandardStatuses = ["pending_review", "submitted", "under_review", "approved", "more_info_required"];

export type CyclistRiderApplicationInput = {
  canRideBicycle?: unknown;
  residentialArea?: unknown;
  preferredOperatingZone?: unknown;
  employmentPreference?: unknown;
  hasSmartphone?: unknown;
  hasValidId?: unknown;
  hasGuarantor?: unknown;
  experienceNotes?: unknown;
};

export type CyclistApplicationRow = {
  id: string;
  status: string;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  approved_at?: string | null;
  rider_activated_at?: string | null;
  rejection_reason?: string | null;
  residential_area?: string | null;
  preferred_operating_zone?: string | null;
  employment_preference?: string | null;
  experience_notes?: string | null;
};

export type CyclistApplicationSubmissionResult =
  | { application: CyclistApplicationRow }
  | { error: string };

type CleanCyclistApplicationInput =
  | { value: { residentialArea: string; preferredOperatingZone: string; employmentPreference: string; experienceNotes: string | null } }
  | { error: string };

export function cleanCyclistApplicationInput(input: CyclistRiderApplicationInput): CleanCyclistApplicationInput {
  const residentialArea = clean(input.residentialArea, 160);
  const preferredOperatingZone = clean(input.preferredOperatingZone, 160);
  const employmentPreference = clean(input.employmentPreference, 40);
  const experienceNotes = clean(input.experienceNotes, 1200);

  if (
    input.canRideBicycle !== true ||
    !residentialArea ||
    !preferredOperatingZone ||
    !preferences.has(employmentPreference) ||
    input.hasSmartphone !== true ||
    input.hasValidId !== true ||
    input.hasGuarantor !== true
  ) {
    return { error: "Complete the bicycle rider application and confirm the listed requirements." };
  }

  return {
    value: { residentialArea, preferredOperatingZone, employmentPreference, experienceNotes: experienceNotes || null }
  };
}

export async function submitCyclistRiderApplication(
  db: SupabaseClient,
  userId: string,
  input: CyclistRiderApplicationInput
): Promise<CyclistApplicationSubmissionResult> {
  const parsed = cleanCyclistApplicationInput(input);
  if (!("value" in parsed)) return { error: parsed.error || "Complete the bicycle rider application." };

  const [{ data: approvedProfile, error: profileError }, { data: standardApplication, error: standardError }, { data: activeCyclist, error: cyclistError }] = await Promise.all([
    db.from("rider_profiles").select("id, application_status").eq("user_id", userId).maybeSingle<{ id: string; application_status?: string | null }>(),
    db.from("rider_applications").select("id, status").eq("user_id", userId).in("status", activeStandardStatuses).order("updated_at", { ascending: false }).limit(1).maybeSingle<{ id: string; status?: string | null }>(),
    db.from("cyclist_applications").select("id, status").eq("user_id", userId).in("status", activeCyclistStatuses).order("updated_at", { ascending: false }).limit(1).maybeSingle<{ id: string; status?: string | null }>()
  ]);
  if (profileError || standardError || cyclistError) return { error: profileError?.message || standardError?.message || cyclistError?.message || "Could not prepare your bicycle rider application." } as const;
  if (approvedProfile?.application_status === "approved") return { error: "Your rider account is already approved. Open your Rider Dashboard to view its current bicycle status." } as const;
  if (standardApplication?.id) return { error: "You already have a standard rider KYC application in progress. Continue that application or ask support to help you change pathways." } as const;
  if (activeCyclist?.id) return { error: "You already have an active bicycle rider application." } as const;

  const { data: referral, error: referralError } = await db
    .from("referrals")
    .select("id, campaign:referral_campaigns!inner(campaign_type)")
    .eq("referred_user_id", userId)
    .maybeSingle<{ id: string; campaign?: { campaign_type?: string | null } | null }>();
  if (referralError) return { error: referralError.message } as const;
  const referralId = referral?.campaign?.campaign_type === "cyclist" ? referral.id : null;
  const now = new Date().toISOString();

  const { error: riderProfileError } = await db.from("rider_profiles").upsert(
    {
      user_id: userId,
      application_status: "submitted",
      rider_account_type: "fastfleets360",
      address: parsed.value.residentialArea,
      operating_zone: parsed.value.preferredOperatingZone,
      // This is the rider's declared dispatch category, not an asset
      // allocation. Eligibility still requires an assigned fleet bicycle.
      vehicle_type: "bike",
      onboarding_path: "bicycle_application",
      online: false,
      suspension_reason: null,
      reviewed_at: null,
      reviewed_by: null,
      updated_at: now
    },
    { onConflict: "user_id" }
  );
  if (riderProfileError) return { error: riderProfileError.message } as const;

  const { error: accountError } = await db
    .from("profiles")
    .update({ rider_onboarding_path: "bicycle_application", kyc_status: "pending_review", updated_at: now })
    .eq("user_id", userId);
  if (accountError) return { error: accountError.message } as const;

  const { data: application, error } = await db
    .from("cyclist_applications")
    .insert({
      user_id: userId,
      referral_id: referralId,
      status: "submitted",
      can_ride_bicycle: true,
      residential_area: parsed.value.residentialArea,
      preferred_operating_zone: parsed.value.preferredOperatingZone,
      employment_preference: parsed.value.employmentPreference,
      has_smartphone: true,
      has_valid_id: true,
      has_guarantor: true,
      experience_notes: parsed.value.experienceNotes
    })
    .select("id, status, submitted_at, residential_area, preferred_operating_zone, employment_preference, experience_notes")
    .single<CyclistApplicationRow>();
  if (error || !application) return { error: /unique/i.test(error?.message || "") ? "You already have an active bicycle rider application." : error?.message || "Could not submit your bicycle rider application." } as const;

  if (referralId) {
    const { data: referrer } = await db.from("referrals").select("referrer_user_id").eq("id", referralId).maybeSingle<{ referrer_user_id?: string | null }>();
    if (referrer?.referrer_user_id) {
      void insertNotificationWithPush(db, {
        user_id: referrer.referrer_user_id,
        title: "Cyclist referral started onboarding",
        body: "Your cyclist referral submitted their application. The reward stays pending until their first completed delivery.",
        type: "referral_cyclist_application",
        metadata: { cyclist_application_id: application.id, url: "/referrals" }
      }).catch(() => undefined);
    }
  }

  return { application } as const;
}

export function cyclistStatusLabel(status: string | null | undefined) {
  const value = String(status || "").trim();
  if (value === "rider_activated") return "Bicycle assigned";
  return value ? value.replaceAll("_", " ") : "Not started";
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
