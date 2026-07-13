import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const packageName = "com.fastfleetlogistics.app";
const fingerprintPattern = /^[A-Fa-f0-9]{2}(?::[A-Fa-f0-9]{2}){31}$/;

function configuredFingerprints() {
  return (process.env.ANDROID_APP_LINKS_SHA256_CERT_FINGERPRINTS || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => fingerprintPattern.test(value));
}

export async function GET() {
  const fingerprints = configuredFingerprints();
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: packageName,
            sha256_cert_fingerprints: fingerprints
          }
        }
      ]
    : [];

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": fingerprints.length ? "public, max-age=3600, s-maxage=3600" : "no-store"
    }
  });
}
