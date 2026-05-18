import type { NotificationPayload } from "@/types/domain";
import { createClient } from "@/lib/supabase/client";

export async function createInAppNotification(payload: NotificationPayload) {
  const supabase = createClient();

  return supabase.from("notifications").insert({
    user_id: payload.userId,
    title: payload.title,
    body: payload.body,
    channel: payload.channel,
    type: payload.type,
    metadata: payload.metadata ?? {}
  });
}

export async function registerPushSubscription(subscription: PushSubscription, userId: string) {
  const supabase = createClient();

  return supabase.from("push_subscriptions").upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    keys: subscription.toJSON().keys,
    updated_at: new Date().toISOString()
  });
}

export function emailTemplate(payload: NotificationPayload) {
  return {
    subject: payload.title,
    preheader: payload.body,
    html: `<strong>${payload.title}</strong><p>${payload.body}</p>`
  };
}
