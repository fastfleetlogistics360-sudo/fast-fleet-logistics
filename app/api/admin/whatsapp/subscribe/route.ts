import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { whatsappConfig } from "@/lib/whatsapp/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GraphError = {
  error?: { message?: string };
};

type PhoneNumberLookup = GraphError & {
  whatsapp_business_account?: { id?: string } | null;
};

export async function POST(request: Request) {
  if (!(await requireAdminSession(request))) return reply({ error: "Admin authorization required." }, 401);

  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) {
    limited.headers.set("Cache-Control", "no-store");
    return limited;
  }

  const config = whatsappConfig();
  if (!config.accessToken || !config.phoneNumberId) {
    return reply({ error: "WhatsApp sending is not configured in this deployment." }, 503);
  }

  try {
    const phoneResponse = await graphRequest<PhoneNumberLookup>(config, `/${config.phoneNumberId}?fields=whatsapp_business_account`);
    const wabaId = String(phoneResponse.whatsapp_business_account?.id || "").trim();
    if (!wabaId) {
      console.error("[whatsapp-subscribe] Phone number has no accessible WhatsApp Business Account.");
      return reply({ error: "FastFleets could not access the WhatsApp business account for this phone number." }, 502);
    }

    const subscription = await graphRequest<GraphError>(config, `/${wabaId}/subscribed_apps`, { method: "POST" });
    if (subscription.error) {
      console.error("[whatsapp-subscribe] Meta rejected the WABA subscription.");
      return reply({ error: "Meta rejected the WhatsApp account subscription. Check the system-user permissions in Meta." }, 502);
    }

    return reply({ subscribed: true, message: "FastFleets is now subscribed to receive WhatsApp messages." }, 200);
  } catch {
    console.error("[whatsapp-subscribe] Meta request failed.");
    return reply({ error: "FastFleets could not connect the WhatsApp account right now. Try once more in a minute." }, 502);
  }
}

async function graphRequest<T>(
  config: ReturnType<typeof whatsappConfig>,
  path: string,
  init: RequestInit = {}
) {
  const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      ...(init.headers || {})
    },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok || !payload) throw new Error("Meta Graph request failed.");
  return payload;
}

function reply(body: Record<string, unknown>, status: number) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
