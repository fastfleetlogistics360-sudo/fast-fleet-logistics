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

class MetaGraphRequestError extends Error {
  constructor(
    readonly step: "phone" | "subscription",
    readonly status: number,
    readonly code: number | null
  ) {
    super("Meta Graph request failed.");
  }
}

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
    const phoneResponse = config.businessAccountId
      ? null
      : await graphRequest<PhoneNumberLookup>(config, "phone", `/${config.phoneNumberId}?fields=whatsapp_business_account`);
    const wabaId = config.businessAccountId || String(phoneResponse?.whatsapp_business_account?.id || "").trim();
    if (!wabaId) {
      console.error("[whatsapp-subscribe] Phone number has no accessible WhatsApp Business Account.");
      return reply({ error: "FastFleets could not access the WhatsApp business account for this phone number." }, 502);
    }

    const subscription = await graphRequest<GraphError>(config, "subscription", `/${wabaId}/subscribed_apps`, { method: "POST" });
    if (subscription.error) {
      console.error("[whatsapp-subscribe] Meta rejected the WABA subscription.");
      return reply({ error: "Meta rejected the WhatsApp account subscription. Check the system-user permissions in Meta." }, 502);
    }

    return reply({ subscribed: true, message: "FastFleets is now subscribed to receive WhatsApp messages." }, 200);
  } catch (error) {
    if (error instanceof MetaGraphRequestError) {
      console.error(`[whatsapp-subscribe] Meta ${error.step} request failed with status ${error.status}, code ${error.code ?? "unknown"}.`);
      return reply({ error: humanReadableMetaError(error) }, 502);
    }
    console.error("[whatsapp-subscribe] Unexpected Meta connection failure.");
    return reply({ error: "FastFleets could not connect the WhatsApp account right now. Try once more in a minute." }, 502);
  }
}

async function graphRequest<T>(
  config: ReturnType<typeof whatsappConfig>,
  step: MetaGraphRequestError["step"],
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
  const payload = await response.json().catch(() => null) as (T & GraphError) | null;
  if (!response.ok || !payload) {
    const code = typeof payload?.error?.message === "string" && typeof (payload.error as { code?: unknown }).code === "number"
      ? (payload.error as { code: number }).code
      : null;
    throw new MetaGraphRequestError(step, response.status, code);
  }
  return payload;
}

function humanReadableMetaError(error: MetaGraphRequestError) {
  if (error.status === 401 || error.code === 190) {
    return "Meta declined the WhatsApp access token. Generate a new permanent system-user token and save it in Vercel, then try again.";
  }
  if (error.step === "phone") {
    return "Meta cannot access the live WhatsApp phone number with this system-user token. In Meta Business Settings, assign the Fast Fleets 360 Logistics WhatsApp account to FastFleets360 WhatsApp API, then generate a fresh token and try again.";
  }
  return "Meta can see the WhatsApp number but rejected the subscription. Confirm the system user has WhatsApp Business Management and Messaging permissions, then try again.";
}

function reply(body: Record<string, unknown>, status: number) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
