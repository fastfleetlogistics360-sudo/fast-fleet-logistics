import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureLaunchPromoEnrollment } from "@/lib/promos/launch-first-150";
import { verifyRiderKycUploads } from "@/lib/kyc-uploads";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { removeStoredObject } from "@/lib/secure-storage";
import { uploadErrorResponse } from "@/lib/upload-security";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RiderVehicleType = "motorcycle" | "tricycle" | "car" | "van";
type DocumentKey =
  | "profile_photo"
  | "government_id"
  | "drivers_licence"
  | "vehicle_registration"
  | "vehicle_papers"
  | "insurance_certificate"
  | "guarantor_letter";

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
  label?: string;
  name?: string;
  progress?: number;
  url?: string;
  path?: string;
  contentType?: string;
};

type RiderApplicationPayload = {
  form: RiderApplicationForm;
  documents: UploadedDoc[];
};

const governmentIdTypes = new Set(["nin_slip", "voters_card", "drivers_licence", "passport"]);

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
    .filter((document): document is UploadedDoc => isString(document.key) && isString(document.path));

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
  const limited = await enforceRateLimit(request, rateLimitPolicies.uploadKycSubmit);
  if (limited) return limited;

  const payload = parsePayload(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ error: "Invalid rider application payload." }, { status: 400 });

  const { form } = payload;
  if (!form.agreement) return NextResponse.json({ error: "Accept the rider agreement before submitting." }, { status: 400 });
  if (!governmentIdTypes.has(form.governmentIdType)) {
    return NextResponse.json({ error: "Choose a valid government ID type." }, { status: 400 });
  }
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
  const db = createAdminClient() || supabase;
  let verifiedDocuments: Awaited<ReturnType<typeof verifyRiderKycUploads>>;
  try {
    verifiedDocuments = await verifyRiderKycUploads(db, {
      userId: user.id,
      governmentIdType: form.governmentIdType,
      documents: payload.documents
    });
  } catch (error) {
    const result = uploadErrorResponse(error);
    return NextResponse.json(result.body, { status: result.status });
  }
  const profilePhotoUrl = verifiedDocuments.find((document) => document.key === "profile_photo")?.publicUrl || null;
  const documents = verifiedDocuments.map((document) => ({
    key: document.key,
    label: documentLabel(document.key),
    name: document.path.split("/").at(-1) || document.key,
    progress: 100,
    url: document.publicUrl || undefined,
    path: document.path,
    contentType: document.contentType
  }));
  await Promise.allSettled([
    db.from("users").upsert({
      id: user.id,
      full_name: form.fullName,
      phone: form.phone,
      email: form.email,
      avatar_url: profilePhotoUrl,
      role: "rider",
      default_zone: form.lga,
      updated_at: now
    }),
    db.from("profiles").upsert({
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
  await ensureLaunchPromoEnrollment(db, user.id);

  const profile = await db
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

  if (profile.error || !profile.data?.id) {
    await cleanupUnreferencedRiderUploads(db, verifiedDocuments);
    return NextResponse.json({ error: "Could not prepare the rider verification profile." }, { status: 500 });
  }

  let riderDocuments: Awaited<ReturnType<typeof persistRiderDocuments>>;
  try {
    riderDocuments = await persistRiderDocuments(db, profile.data.id, verifiedDocuments);
  } catch {
    return NextResponse.json({ error: "Could not securely attach the rider documents." }, { status: 500 });
  }

  const application = await db
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
    await riderDocuments.rollback();
    return NextResponse.json({ error: "Could not submit the rider application." }, { status: 500 });
  }

  await riderDocuments.finalize();
  return NextResponse.json({ id: application.data.id, status: "pending_review" });
}

async function persistRiderDocuments(
  db: SupabaseClient,
  riderProfileId: string,
  documents: Awaited<ReturnType<typeof verifyRiderKycUploads>>
) {
  const { data: currentRows, error: currentError } = await db
    .from("rider_documents")
    .select("id, rider_profile_id, document_type, file_url, storage_path, status, rejection_reason")
    .eq("rider_profile_id", riderProfileId);
  if (currentError) throw currentError;
  const currentByType = new Map((currentRows || []).map((row) => [String(row.document_type), row]));
  const applied: Array<{
    previous: (typeof currentRows extends Array<infer Row> ? Row : never) | undefined;
    next: (typeof documents)[number];
    insertedId?: string;
  }> = [];

  try {
    for (const document of documents) {
      const current = currentByType.get(document.key);
      const payload = {
        rider_profile_id: riderProfileId,
        document_type: document.key,
        file_url: document.publicUrl,
        storage_path: document.path,
        status: "submitted",
        rejection_reason: null,
        updated_at: new Date().toISOString()
      };
      if (current?.id) {
        const result = await db.from("rider_documents").update(payload).eq("id", current.id);
        if (result.error) throw result.error;
        applied.push({ previous: current, next: document });
      } else {
        const result = await db.from("rider_documents").insert(payload).select("id").single<{ id: string }>();
        if (result.error || !result.data?.id) throw result.error || new Error("Could not create rider document reference.");
        applied.push({ previous: undefined, next: document, insertedId: result.data.id });
      }
    }
  } catch (error) {
    await rollbackRiderDocuments(db, applied, documents);
    throw error;
  }

  return {
    rollback: () => rollbackRiderDocuments(db, applied, documents),
    finalize: async () => {
      const oldUploads = applied
        .map((entry) => ({
          bucket: entry.next.key === "profile_photo" ? "profile-photos" : "rider-documents",
          path: String(entry.previous?.storage_path || ""),
          nextPath: entry.next.path
        }))
        .filter((entry) => entry.path && entry.path !== entry.nextPath);
      await Promise.allSettled(oldUploads.map((entry) => removeStoredObject(db, entry.bucket, entry.path)));
    }
  };
}

async function rollbackRiderDocuments(
  db: SupabaseClient,
  applied: Array<{
    previous: { id?: string; file_url?: string | null; storage_path?: string | null; status?: string | null; rejection_reason?: string | null } | undefined;
    insertedId?: string;
  }>,
  documents: Awaited<ReturnType<typeof verifyRiderKycUploads>>
) {
  await Promise.allSettled(
    applied
      .slice()
      .reverse()
      .map((entry) => {
        if (entry.previous?.id) {
          return db
            .from("rider_documents")
            .update({
              file_url: entry.previous.file_url || null,
              storage_path: entry.previous.storage_path || null,
              status: entry.previous.status || "submitted",
              rejection_reason: entry.previous.rejection_reason || null,
              updated_at: new Date().toISOString()
            })
            .eq("id", entry.previous.id);
        }
        return entry.insertedId ? db.from("rider_documents").delete().eq("id", entry.insertedId) : Promise.resolve();
      })
  );
  await cleanupUnreferencedRiderUploads(db, documents);
}

async function cleanupUnreferencedRiderUploads(db: SupabaseClient, documents: Awaited<ReturnType<typeof verifyRiderKycUploads>>) {
  const paths = documents.map((document) => document.path);
  if (!paths.length) return;
  const { data, error } = await db.from("rider_documents").select("storage_path").in("storage_path", paths);
  if (error) return;
  const referenced = new Set((data || []).map((row) => String(row.storage_path || "")));
  await Promise.allSettled(
    documents
      .filter((document) => !referenced.has(document.path))
      .map((document) => removeStoredObject(db, document.bucket, document.path))
  );
}

function documentLabel(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
