import { createSign } from "node:crypto";

type PushSubscriptionRow = {
  provider?: string | null;
  token?: string | null;
  keys?: unknown;
};

type NotificationPayload = {
  id?: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  metadata?: Record<string, unknown> | null;
};

type SupabaseLike = {
  from: (table: string) => any;
};

let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function firebaseConfig() {
  const projectId = process.env.FCM_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FCM_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

async function getFirebaseAccessToken() {
  const config = firebaseConfig();
  if (!config) return null;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = createSign("RSA-SHA256").update(unsignedJwt).sign(config.privateKey);
  const assertion = `${unsignedJwt}.${base64Url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!payload?.access_token) return null;
  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000
  };
  return payload.access_token;
}

function stringData(metadata: Record<string, unknown> | null | undefined, fallbackUrl = "/hub") {
  const data: Record<string, string> = { url: fallbackUrl };
  Object.entries(metadata || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    data[key] = typeof value === "string" ? value : JSON.stringify(value);
  });
  return data;
}

async function sendFcm(subscription: PushSubscriptionRow, notification: NotificationPayload) {
  const config = firebaseConfig();
  if (!config) return;
  const token = subscription.token || (subscription.keys && typeof subscription.keys === "object" ? String((subscription.keys as { token?: string }).token || "") : "");
  if (!token) return;
  const accessToken = await getFirebaseAccessToken();
  if (!accessToken) return;

  await fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: stringData(notification.metadata, "/hub")
      }
    })
  }).catch(() => null);
}

export async function dispatchPushForNotification(db: SupabaseLike, notification: NotificationPayload) {
  const { data } = await db
    .from("push_subscriptions")
    .select("provider, token, keys")
    .eq("user_id", notification.user_id)
    .limit(20);
  await Promise.allSettled(
    ((data || []) as PushSubscriptionRow[]).map((subscription) => {
      if (subscription.provider === "fcm") return sendFcm(subscription, notification);
      return Promise.resolve();
    })
  );
}

export async function insertNotificationWithPush(db: SupabaseLike, notification: NotificationPayload) {
  const { data, error } = await db
    .from("notifications")
    .insert({
      user_id: notification.user_id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      channel: "in_app",
      metadata: notification.metadata || {}
    })
    .select("id, user_id, title, body, type, metadata")
    .single();

  if (!error && data) {
    await dispatchPushForNotification(db, data as NotificationPayload);
  }

  return { data, error };
}
