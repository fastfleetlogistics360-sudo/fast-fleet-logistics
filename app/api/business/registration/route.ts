import { NextResponse } from "next/server";
import { normalizeState } from "@/lib/launch-states";
import { ensureLaunchPromoEnrollment } from "@/lib/promos/launch-first-150";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const businessTypes = ["Restaurant", "Mall", "Grocery", "Pharmacy", "Fashion"] as const;
const businessDocumentKeys = ["storefront_photo", "cac_certificate", "director_government_id", "address_proof"] as const;
const requiredBusinessDocumentKeys = ["storefront_photo", "cac_certificate", "address_proof"] as const;

type BusinessType = (typeof businessTypes)[number];
type BusinessDocumentKey = (typeof businessDocumentKeys)[number];

type BusinessRegistrationPayload = {
  form: {
    businessName: string;
    contactName: string;
    phone: string;
    email: string;
    businessType: BusinessType;
    commissionRate: number;
    industry: string;
    dispatchVolume: string;
    state: string;
    pickupAddress: string;
    cacNumber: string;
  };
  documents: Array<{
    key: BusinessDocumentKey;
    url?: string;
    path?: string;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string, maxLength = 220) {
  const value = record[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parsePayload(value: unknown): BusinessRegistrationPayload | null {
  if (!isRecord(value) || !isRecord(value.form) || !Array.isArray(value.documents)) return null;
  const form = value.form;
  const rawBusinessType = readString(form, "businessType", 40);
  const businessType = (businessTypes.includes(rawBusinessType as BusinessType) ? rawBusinessType : "Restaurant") as BusinessType;
  const documents: BusinessRegistrationPayload["documents"] = [];
  for (const item of value.documents) {
    if (!isRecord(item)) continue;
    const key = readString(item, "key", 60) as BusinessDocumentKey;
    if (!businessDocumentKeys.includes(key)) continue;
    const url = readString(item, "url", 600);
    const path = readString(item, "path", 600);
    if (url || path) documents.push({ key, url: url || undefined, path: path || undefined });
  }

  return {
    form: {
      businessName: readString(form, "businessName", 140),
      contactName: readString(form, "contactName", 120),
      phone: readString(form, "phone", 40),
      email: readString(form, "email", 180),
      businessType,
      commissionRate: Number(form.commissionRate || 0),
      industry: readString(form, "industry", 120) || businessType,
      dispatchVolume: readString(form, "dispatchVolume", 120),
      state: normalizeState(readString(form, "state", 80)),
      pickupAddress: readString(form, "pickupAddress", 260),
      cacNumber: readString(form, "cacNumber", 80)
    },
    documents
  };
}

export async function POST(request: Request) {
  const payload = parsePayload(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ error: "Invalid business registration payload." }, { status: 400 });

  const { form, documents } = payload;
  if (form.businessName.length < 3 || form.contactName.length < 2 || form.phone.length < 10 || !form.state || form.pickupAddress.length < 5 || form.cacNumber.length < 4) {
    return NextResponse.json({ error: "Complete the business details before submitting KYC." }, { status: 400 });
  }
  if (requiredBusinessDocumentKeys.some((key) => !documents.some((document) => document.key === key))) {
    return NextResponse.json({ error: "Upload every required business KYC document." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to submit your business KYC." }, { status: 401 });
  }

  const db = createAdminClient() || supabase;
  const now = new Date().toISOString();

  await db.from("users").upsert({
    id: user.id,
    full_name: form.contactName,
    phone: form.phone,
    email: form.email || user.email || null,
    role: "business",
    default_zone: form.state,
    updated_at: now
  });
  await ensureLaunchPromoEnrollment(db, user.id);

  const profilePayload = {
    user_id: user.id,
    business_name: form.businessName,
    contact_name: form.contactName,
    phone: form.phone,
    email: form.email || user.email || null,
    industry: form.industry,
    business_type: form.businessType,
    commission_rate: form.commissionRate,
    operating_state: form.state,
    dispatch_volume: form.dispatchVolume,
    pickup_address: form.pickupAddress,
    cac_number: form.cacNumber,
    registration_status: "submitted" as const,
    rejection_reason: null,
    reviewed_at: null,
    updated_at: now
  };

  let profileResult = await db.from("business_profiles").upsert(profilePayload, { onConflict: "user_id" }).select("id").single<{ id: string }>();
  if (profileResult.error) {
    const { cac_number: _cacNumber, rejection_reason: _rejectionReason, business_type: _businessType, commission_rate: _commissionRate, operating_state: _operatingState, reviewed_at: _reviewedAt, ...fallbackPayload } = profilePayload;
    profileResult = await db.from("business_profiles").upsert(fallbackPayload, { onConflict: "user_id" }).select("id").single<{ id: string }>();
  }
  if (profileResult.error) {
    return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
  }

  const businessProfileId = profileResult.data.id;
  const documentsResult = await db.from("business_documents").upsert(
    documents.map((document) => ({
      business_profile_id: businessProfileId,
      user_id: user.id,
      document_type: document.key,
      file_url: document.url || null,
      storage_path: document.path || null,
      status: "submitted" as const,
      rejection_reason: null,
      updated_at: now
    })),
    { onConflict: "business_profile_id,document_type" }
  );
  if (documentsResult.error) {
    return NextResponse.json({ error: documentsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({ business_profile_id: businessProfileId, registration_status: "submitted" });
}
