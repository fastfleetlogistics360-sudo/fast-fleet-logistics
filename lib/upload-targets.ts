import type { UploadProfileName } from "@/lib/upload-security";

export type UploadKind = "profile-photo" | "rider-document" | "business-document" | "hero-image";

export type UploadTarget = {
  bucket: "profile-photos" | "rider-documents" | "business-documents" | "hero-images";
  profile: UploadProfileName;
  public: boolean;
  context: string;
  adminOnly: boolean;
};

export const riderDocumentTypes = [
  "government_id",
  "drivers_licence",
  "vehicle_registration",
  "vehicle_papers",
  "insurance_certificate",
  "guarantor_letter"
] as const;

export const businessDocumentTypes = [
  "storefront_photo",
  "cac_certificate",
  "director_government_id",
  "address_proof"
] as const;

export type RiderDocumentType = (typeof riderDocumentTypes)[number];
export type BusinessDocumentType = (typeof businessDocumentTypes)[number];

const riderDocumentProfiles: Record<RiderDocumentType, UploadProfileName> = {
  government_id: "kyc-image",
  drivers_licence: "kyc-image",
  vehicle_registration: "kyc-document",
  vehicle_papers: "kyc-image",
  insurance_certificate: "kyc-document",
  guarantor_letter: "kyc-document"
};

const businessDocumentProfiles: Record<BusinessDocumentType, UploadProfileName> = {
  storefront_photo: "kyc-image",
  cac_certificate: "kyc-document",
  director_government_id: "kyc-image",
  address_proof: "kyc-document"
};

export function resolveUploadTarget(kind: UploadKind, documentType: string): UploadTarget | null {
  if (kind === "profile-photo") {
    return { bucket: "profile-photos", profile: "avatar", public: true, context: "profile", adminOnly: false };
  }
  if (kind === "hero-image") {
    return { bucket: "hero-images", profile: "admin-banner", public: true, context: "site-media", adminOnly: true };
  }
  if (kind === "rider-document" && isRiderDocumentType(documentType)) {
    return {
      bucket: "rider-documents",
      profile: riderDocumentProfiles[documentType],
      public: false,
      context: documentType,
      adminOnly: false
    };
  }
  if (kind === "business-document" && isBusinessDocumentType(documentType)) {
    return {
      bucket: "business-documents",
      profile: businessDocumentProfiles[documentType],
      public: false,
      context: documentType,
      adminOnly: false
    };
  }
  return null;
}

export function isRiderDocumentType(value: string): value is RiderDocumentType {
  return riderDocumentTypes.includes(value as RiderDocumentType);
}

export function isBusinessDocumentType(value: string): value is BusinessDocumentType {
  return businessDocumentTypes.includes(value as BusinessDocumentType);
}

export function riderDocumentProfile(value: RiderDocumentType) {
  return riderDocumentProfiles[value];
}

export function businessDocumentProfile(value: BusinessDocumentType) {
  return businessDocumentProfiles[value];
}
