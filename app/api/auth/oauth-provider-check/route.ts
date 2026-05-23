import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function POST(request: Request) {
  if (!supabaseUrl) {
    return NextResponse.json({ ok: false, reason: "Supabase URL is not configured." }, { status: 503 });
  }

  try {
    const { url, provider } = (await request.json()) as { url?: string; provider?: string };
    if (!url || !provider) {
      return NextResponse.json({ ok: false, reason: "OAuth URL and provider are required." }, { status: 400 });
    }

    const authorizeUrl = new URL(url);
    const configuredSupabaseUrl = new URL(supabaseUrl);
    if (authorizeUrl.origin !== configuredSupabaseUrl.origin) {
      return NextResponse.json({ ok: false, reason: "OAuth URL does not match this Supabase project." }, { status: 400 });
    }

    const response = await fetch(authorizeUrl.toString(), { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      return NextResponse.json({ ok: true });
    }

    const text = await response.text();
    if (response.status === 400 && text.toLowerCase().includes("provider is not enabled")) {
      return NextResponse.json({
        ok: false,
        reason: "Google sign-in is not enabled in Supabase yet."
      });
    }

    return NextResponse.json({ ok: response.ok, reason: response.ok ? null : "OAuth provider is unavailable." });
  } catch {
    return NextResponse.json({ ok: false, reason: "Could not verify OAuth provider status." }, { status: 502 });
  }
}
