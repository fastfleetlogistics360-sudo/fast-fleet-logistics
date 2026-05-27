import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RiderVehicleType = "motorcycle" | "tricycle" | "car" | "van";
type DocumentKey = "profile_photo" | "government_id" | "drivers_licence" | "vehicle_registration" | "insurance_certificate" | "guarantor_letter";

type RiderApplicationForm = {
  fullName: string;
  phone: string;
  email: string;
  lga: string;
  vehicleType: RiderVehicleType;
  make: string;
  model: string;
  year: string;
  plateNumber: string;
  color: string;
  governmentIdType: string;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  agreement: boolean;
};

type UploadedDoc = {
  key: DocumentKey;
  label: string;
  name: string;
  progress: number;
  url?: string;
  path?: string;
  contentType?: string;
};

type RiderApplicationPayload = {
  form: RiderApplicationForm;
  documents: UploadedDoc[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return isString(value) ? value : "";
}

function parsePayload(value: unknown): RiderApplicationPayload | null {
  if (!isRecord(value) || !isRecord(value.form) || !Array.isArray(value.documents)) return null;
  const form = value.form;
  const requiredStringKeys: Array<keyof Omit<RiderApplicationForm, "agreement">> = [
    "fullName",
    "phone",
    "email",
    "lga",
    "vehicleType",
    "make",
    "model",
    "year",
    "plateNumber",
    "color",
    "governmentIdType",
    "bankName",
    "bankCode",
    "accountNumber",
    "accountName"
  ];

  if (!requiredStringKeys.every((key) => isString(form[key]))) return null;
  if (typeof form.agreement !== "boolean") return null;

  const documents = value.documents
    .filter(isRecord)
    .filter((document): document is UploadedDoc => isString(document.key) && isString(document.label) && isString(document.name) && typeof document.progress === "number");

  return {
    form: {
      fullName: readString(form, "fullName"),
      phone: readString(form, "phone"),
      email: readString(form, "email"),
      lga: readString(form, "lga"),
      vehicleType: readString(form, "vehicleType") as RiderVehicleType,
      make: readString(form, "make"),
      model: readString(form, "model"),
      year: readString(form, "year"),
      plateNumber: readString(form, "plateNumber"),
      color: readString(form, "color"),
      governmentIdType: readString(form, "governmentIdType"),
      bankName: readString(form, "bankName"),
      bankCode: readString(form, "bankCode"),
      accountNumber: readString(form, "accountNumber"),
      accountName: readString(form, "accountName"),
      agreement: form.agreement
    },
    documents
  };
}

function legacyVehicleType(vehicleType: RiderVehicleType) {
  if (vehicleType === "car" || vehicleType === "van") return vehicleType;
  return "bike";
}

export async function POST(request: NextRequest) {
  const payload = parsePayload(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ error: "Invalid rider application payload." }, { status: 400 });

  const { form, documents } = payload;
  const profilePhotoUrl = documents.find((document) => document.key === "profile_photo")?.url || null;
  if (!form.agreement) return NextResponse.json({ error: "Accept the rider agreement before submitting." }, { status: 400 });
  if (!/^\+234[789][01]\d{8}$/.test(form.phone)) return NextResponse.json({ error: "Enter a valid Nigerian phone number." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to submit your rider application." }, { status: 401 });
  }

  const now = new Date().toISOString();
  await Promise.allSettled([
    supabase.from("users").upsert({
      id: user.id,
      full_name: form.fullName,
      phone: form.phone,
      email: form.email,
      avatar_url: profilePhotoUrl,
      role: "rider",
      default_zone: form.lga,
      updated_at: now
    }),
    supabase.from("profiles").upsert({
      id: user.id,
      user_id: user.id,
      full_name: form.fullName,
      phone: form.phone,
      email: form.email,
      avatar_url: profilePhotoUrl,
      account_type: "rider",
      updated_at: now
    })
  ]);

  const application = await supabase
    .from("rider_applications")
    .insert({
      user_id: user.id,
      status: "pending_review",
      full_name: form.fullName,
      phone: form.phone,
      email: form.email,
      lga: form.lga,
      vehicle_type: form.vehicleType,
      vehicle_make: form.make,
      vehicle_model: form.model,
      vehicle_year: Number(form.year),
      plate_number: form.plateNumber,
      vehicle_color: form.color,
      government_id_type: form.governmentIdType,
      bank_name: form.bankName,
      bank_code: form.bankCode,
      account_number: form.accountNumber,
      account_name: form.accountName,
      documents,
      agreement_accepted_at: now
    })
    .select("id")
    .single();

  if (application.error) {
    return NextResponse.json({ error: application.error.message }, { status: 500 });
  }

  const profile = await supabase
    .from("rider_profiles")
    .upsert(
      {
        user_id: user.id,
        application_status: "submitted",
        address: form.lga,
        vehicle_type: legacyVehicleType(form.vehicleType),
        plate_number: form.plateNumber,
        vehicle_color: form.color,
        operating_zone: form.lga,
        bank_name: form.bankName,
        account_number: form.accountNumber,
        account_name: form.accountName,
        online: false,
        updated_at: now
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .single();

  if (!profile.error) {
    await Promise.allSettled(
      documents.map((document) =>
        supabase.from("rider_documents").insert({
          rider_profile_id: profile.data.id,
          document_type: document.key,
          file_url: document.url || null,
          storage_path: document.path || null,
          status: "submitted"
        })
      )
    );
  }

  return NextResponse.json({ id: application.data.id, status: "pending_review" });
}
