import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/whatsapp/messages";
import { sha256 } from "@/lib/whatsapp/security";

export async function GET(request: NextRequest) {
  const challenge = String(request.nextUrl.searchParams.get("challenge") || "").trim();
  if (!challenge) return redirect(request, "Your WhatsApp connection link is missing. Please return to WhatsApp and try again.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect(request, "Please sign in before connecting WhatsApp.");

  const admin = createAdminClient();
  if (!admin) return redirect(request, "WhatsApp connection is temporarily unavailable. Please try again.");

  const { data: record, error } = await admin
    .from("whatsapp_link_challenges")
    .select("id, whatsapp_phone, user_id, expires_at, consumed_at, users(full_name)")
    .eq("token_hash", sha256(challenge))
    .maybeSingle<{ id: string; whatsapp_phone: string; user_id: string; expires_at: string; consumed_at: string | null; users?: { full_name?: string | null } | null }>();
  if (error || !record || record.user_id !== user.id || record.consumed_at || new Date(record.expires_at).getTime() <= Date.now()) {
    return redirect(request, "This WhatsApp connection link has expired or was already used. Please request a new link in WhatsApp.");
  }

  const { data: existingLink, error: existingError } = await admin
    .from("whatsapp_account_links")
    .select("user_id")
    .eq("whatsapp_phone", record.whatsapp_phone)
    .maybeSingle<{ user_id: string }>();
  if (existingError) return redirect(request, "WhatsApp connection is temporarily unavailable. Please try again.");
  if (existingLink && existingLink.user_id !== user.id) {
    return redirect(request, "This WhatsApp number is already connected to another FastFleets account. Contact support if you need help.");
  }

  const now = new Date().toISOString();
  const { error: linkError } = await admin.from("whatsapp_account_links").upsert({
    whatsapp_phone: record.whatsapp_phone,
    user_id: user.id,
    verified_at: now,
    last_seen_at: now
  }, { onConflict: "whatsapp_phone" });
  if (linkError) return redirect(request, "We could not save your WhatsApp connection. Please try again.");

  await Promise.allSettled([
    admin.from("whatsapp_link_challenges").update({ consumed_at: now }).eq("id", record.id),
    admin.from("whatsapp_conversations").upsert({ whatsapp_phone: record.whatsapp_phone, user_id: user.id, state: "ready", state_data: {}, last_message_at: now, updated_at: now }, { onConflict: "whatsapp_phone" }),
    sendWhatsAppText({ to: record.whatsapp_phone, body: `Welcome, ${firstName(record.users?.full_name)}. Your WhatsApp is connected to FastFleets 360. Reply MARKETPLACE to order shopping or food, or DISPATCH to book a delivery.` })
  ]);

  const successUrl = new URL("/hub", request.url);
  successUrl.searchParams.set("whatsappLinked", "1");
  return NextResponse.redirect(successUrl);
}

function redirect(request: NextRequest, error: string) {
  const url = new URL("/auth", request.url);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}
