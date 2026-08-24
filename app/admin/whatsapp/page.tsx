import type { Metadata } from "next";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { AdminLogin } from "@/components/admin/admin-login";
import { WhatsAppWebhookSubscription } from "@/components/admin/whatsapp-webhook-subscription";

export const metadata: Metadata = { title: "WhatsApp Administration" };
export const dynamic = "force-dynamic";

export default async function WhatsAppAdministrationPage() {
  return (await requireAdminSession()) ? <WhatsAppWebhookSubscription /> : <AdminLogin />;
}
