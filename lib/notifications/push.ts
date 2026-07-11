import { createCipheriv, createECDH, createHmac, createPrivateKey, createSign, randomBytes } from "node:crypto";
import { accountMessengerHref } from "@/lib/tracking-links";

type PushSubscriptionRow = {
  provider?: string | null;
  endpoint?: string | null;
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

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function firebaseConfig() {
  const projectId = process.env.FCM_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FCM_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function vapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || "mailto:support@fastfleet.com.ng";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
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

function stringValue(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function topicValue(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32) || "fastfleet-update";
}

function notificationTag(notification: NotificationPayload, metadata: Record<string, unknown>) {
  const explicit = stringValue(metadata, "tag");
  if (explicit) return topicValue(explicit);
  const code = stringValue(metadata, "delivery_code") || stringValue(metadata, "order_code") || stringValue(metadata, "delivery_id") || stringValue(metadata, "order_id");
  if (code && ["delivery_update", "delivery_completed", "order_update", "package_confirmation"].includes(notification.type)) return topicValue(`ff-${code}`);
  return topicValue(`ff-${notification.type}`);
}

function fallbackUrlFor(notification: NotificationPayload, metadata: Record<string, unknown>) {
  const explicit = stringValue(metadata, "url") || stringValue(metadata, "tracking_url");
  if (explicit.startsWith("/") && !explicit.startsWith("//")) return explicit;

  if (notification.type === "dispatch_request" || notification.type === "delivery_update_rider") return "/rider/dashboard";
  if (notification.type === "business_order_received" || notification.type === "business_order_update" || notification.type === "dispatch_created") return "/business/dashboard";
  if (notification.type === "package_confirmation" && stringValue(metadata, "status") !== "pending") return "/rider/dashboard";

  const trackingCode = stringValue(metadata, "delivery_code") || stringValue(metadata, "order_code") || stringValue(metadata, "delivery_id") || stringValue(metadata, "order_id");
  if (trackingCode && ["delivery_update", "delivery_completed", "order_update", "package_confirmation"].includes(notification.type)) return accountMessengerHref(trackingCode);
  return "/hub";
}

function enrichMetadata(notification: NotificationPayload) {
  const metadata = { ...(notification.metadata || {}) };
  const url = fallbackUrlFor(notification, metadata);
  const tag = notificationTag(notification, metadata);
  return {
    ...metadata,
    url,
    tracking_url: url,
    tag,
    live_update: ["delivery_update", "delivery_completed", "order_update", "package_confirmation"].includes(notification.type)
  };
}

function webPushPayload(notification: NotificationPayload, metadata: Record<string, unknown>) {
  return {
    title: notification.title,
    body: notification.body,
    icon: "/icons/icon-192.png?v=20260629",
    badge: "/icons/icon-180.png?v=20260629",
    tag: notificationTag(notification, metadata),
    renotify: true,
    data: {
      ...metadata,
      notification_id: notification.id || "",
      type: notification.type
    }
  };
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer | string, length: number) {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  let previous = Buffer.alloc(0);
  const output: Buffer[] = [];
  let counter = 1;
  while (Buffer.concat(output).length < length) {
    previous = createHmac("sha256", prk)
      .update(Buffer.concat([previous, Buffer.isBuffer(info) ? info : Buffer.from(info), Buffer.from([counter])]))
      .digest();
    output.push(previous);
    counter += 1;
  }
  return Buffer.concat(output).subarray(0, length);
}

function createVapidAuthorization(endpoint: string) {
  const config = vapidConfig();
  if (!config) return null;
  const publicKey = base64UrlDecode(config.publicKey);
  const privateKey = base64UrlDecode(config.privateKey);
  if (publicKey.length !== 65 || privateKey.length !== 32) return null;

  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const claim = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: base64Url(publicKey.subarray(1, 33)),
      y: base64Url(publicKey.subarray(33, 65)),
      d: base64Url(privateKey)
    },
    format: "jwk"
  });
  const signature = createSign("SHA256").update(unsignedJwt).sign({ key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsignedJwt}.${base64Url(signature)}, k=${config.publicKey}`;
}

function encryptWebPushPayload(payload: Record<string, unknown>, userPublicKey: string, authSecret: string) {
  const receiverPublicKey = base64UrlDecode(userPublicKey);
  const auth = base64UrlDecode(authSecret);
  if (receiverPublicKey.length !== 65 || !auth.length) return null;

  const serverCurve = createECDH("prime256v1");
  serverCurve.generateKeys();
  const serverPublicKey = serverCurve.getPublicKey();
  const sharedSecret = serverCurve.computeSecret(receiverPublicKey);
  const salt = randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), receiverPublicKey, serverPublicKey]);
  const ikm = hkdf(auth, sharedSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16);
  const nonce = hkdf(salt, ikm, "Content-Encoding: nonce\0", 12);
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([0x02])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(serverPublicKey.length, 20);
  return Buffer.concat([header, serverPublicKey, encrypted]);
}

async function sendFcm(subscription: PushSubscriptionRow, notification: NotificationPayload) {
  const config = firebaseConfig();
  if (!config) return;
  const metadata = enrichMetadata(notification);
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
        data: stringData(metadata, stringValue(metadata, "url") || "/hub"),
        android: {
          priority: "high",
          ttl: "1800s",
          notification: {
            channel_id: "delivery_updates",
            tag: notificationTag(notification, metadata),
            click_action: "OPEN_FASTFLEETS_TRACKING"
          }
        },
        webpush: {
          fcm_options: {
            link: stringValue(metadata, "url") || "/hub"
          },
          headers: {
            TTL: "1800",
            Topic: notificationTag(notification, metadata)
          }
        }
      }
    })
  }).catch(() => null);
}

async function sendWebPush(subscription: PushSubscriptionRow, notification: NotificationPayload) {
  const endpoint = subscription.endpoint || "";
  const keys = subscription.keys && typeof subscription.keys === "object" ? (subscription.keys as { p256dh?: string; auth?: string }) : null;
  if (!endpoint || !keys?.p256dh || !keys.auth) return;
  const metadata = enrichMetadata(notification);
  const authorization = createVapidAuthorization(endpoint);
  if (!authorization) return;
  const body = encryptWebPushPayload(webPushPayload(notification, metadata), keys.p256dh, keys.auth);
  if (!body) return;
  await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "1800",
      Urgency: notification.type === "dispatch_request" || notification.type === "package_confirmation" ? "high" : "normal",
      Topic: notificationTag(notification, metadata)
    },
    body
  }).catch(() => null);
}

export async function dispatchPushForNotification(db: SupabaseLike, notification: NotificationPayload) {
  const { data } = await db
    .from("push_subscriptions")
    .select("provider, endpoint, token, keys")
    .eq("user_id", notification.user_id)
    .limit(20);
  await Promise.allSettled(
    ((data || []) as PushSubscriptionRow[]).map((subscription) => {
      if (subscription.provider === "fcm") return sendFcm(subscription, notification);
      if (subscription.provider === "web_push") return sendWebPush(subscription, notification);
      return Promise.resolve();
    })
  );
}

export async function insertNotificationWithPush(db: SupabaseLike, notification: NotificationPayload) {
  const metadata = enrichMetadata(notification);
  const { data, error } = await db
    .from("notifications")
    .insert({
      user_id: notification.user_id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      channel: "in_app",
      metadata
    })
    .select("id, user_id, title, body, type, metadata")
    .single();

  if (!error && data) {
    await dispatchPushForNotification(db, data as NotificationPayload);
  }

  return { data, error };
}
