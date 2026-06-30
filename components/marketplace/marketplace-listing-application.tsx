"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Clock3, Loader2, Store, XCircle } from "lucide-react";
import type { UserRole } from "@/types/domain";
import { canRetryMarketplaceListing, marketplaceListingRetryDate, type MarketplaceListingApplication } from "@/lib/marketplace-listing";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type BusinessSummary = {
  id?: string | null;
  business_name?: string | null;
  phone?: string | null;
  email?: string | null;
  industry?: string | null;
  business_type?: string | null;
  commission_rate?: number | string | null;
  dispatch_volume?: string | null;
  registration_status?: string | null;
};

export function MarketplaceListingApplication({
  role,
  business,
  application,
  accountEmail
}: {
  role: UserRole;
  business: BusinessSummary | null;
  application: MarketplaceListingApplication | null;
  accountEmail: string | null;
}) {
  const [submittedApplication, setSubmittedApplication] = useState<MarketplaceListingApplication | null>(null);
  const latestApplication = submittedApplication || application;
  const [form, setForm] = useState({
    storeName: business?.business_name || "",
    storeCategory: business?.business_type || business?.industry || "",
    itemCount: "5",
    expectedAverageOrders: business?.dispatch_volume || "",
    contactEmail: business?.email || accountEmail || "",
    whatsappNumber: business?.phone || ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const commissionRate = useMemo(() => {
    const rate = Number(business?.commission_rate ?? 0);
    return Number.isFinite(rate) && rate > 0 ? `${rate.toFixed(0)}%` : "Not set";
  }, [business?.commission_rate]);

  if (role !== "business") {
    return (
      <StatusScreen
        icon="blocked"
        title="INELIGIBLE TO NON-BUSINESS ACCOUNT USERS."
        body="Marketplace Listing is only available to approved business accounts."
        actions={<LinkButton href="/business/register">SIGN UP A BUSINESS ACCOUNT</LinkButton>}
      />
    );
  }

  if (!business?.id || business.registration_status !== "active") {
    return (
      <StatusScreen
        icon="pending"
        title="Business KYC required"
        body="Marketplace Listing opens after your business KYC is approved."
        actions={<LinkButton href="/business/register">Open Business KYC</LinkButton>}
      />
    );
  }

  if (submittedApplication?.status === "submitted") {
    return (
      <StatusScreen
        icon="success"
        title="THANK YOU for applying for Marketplace Listing."
        body="Your application is under review, and you would be contacted via the email you provided or through your WhatsApp number."
        actions={<LinkButton href="/business/dashboard">RETURN TO DASHBOARD</LinkButton>}
      />
    );
  }

  if (latestApplication?.status === "submitted") {
    return (
      <StatusScreen
        icon="pending"
        title="Marketplace listing request received"
        body="Please await confirmation email or message. Your application is under review."
        actions={<LinkButton href="/business/dashboard">Return to Dashboard</LinkButton>}
      />
    );
  }

  if (latestApplication?.status === "accepted") {
    return (
      <StatusScreen
        icon="success"
        title="HORRAY! Your marketplace application was accepted."
        body="Your business goes live on or before 7 business days."
        actions={<LinkButton href="/business/dashboard">Return to Dashboard</LinkButton>}
      />
    );
  }

  const retryLocked = latestApplication?.status === "rejected" && !canRetryMarketplaceListing(latestApplication);
  if (retryLocked) {
    return (
      <StatusScreen
        icon="blocked"
        title="Marketplace listing request rejected"
        body={`${latestApplication?.rejection_reason || "Your request was not approved."} You can try again after ${marketplaceListingRetryDate(latestApplication)}.`}
        actions={<LinkButton href="/business/dashboard">Return to Dashboard</LinkButton>}
      />
    );
  }

  async function submitApplication() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/marketplace/listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: form.storeName,
          store_category: form.storeCategory,
          item_count: Number(form.itemCount),
          expected_average_orders: form.expectedAverageOrders,
          contact_email: form.contactEmail,
          whatsapp_number: form.whatsappNumber
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { application?: MarketplaceListingApplication; error?: string };
      if (!response.ok || !payload.application) throw new Error(payload.error || "Could not submit Marketplace Listing request.");
      setSubmittedApplication(payload.application);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit Marketplace Listing request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section-wrap grid gap-5 py-6 sm:py-8 lg:grid-cols-[0.82fr_1.18fr]">
      <Card className="p-5">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Marketplace Listing</span>
        <h1 className="mt-2 text-3xl font-black leading-tight text-fleet-night sm:text-5xl">Apply to list your store.</h1>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
          Submit your mall or marketplace listing request. Fast Fleets 360 reviews approved business accounts before adding live products.
        </p>
        <div className="mt-5 grid gap-3">
          <MiniFact label="Business KYC" value="Approved" />
          <MiniFact label="Store name" value={business.business_name || "Autofilled from KYC"} />
          <MiniFact label="Category commission" value={`${form.storeCategory || "Category"} · ${commissionRate}`} />
        </div>
      </Card>

      <Card className="p-5">
        {latestApplication?.status === "rejected" ? (
          <div className="mb-5 rounded-fleet bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
            Previous request was rejected: {latestApplication.rejection_reason || "No reason provided."} You can submit a new request now.
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store name" value={form.storeName} onChange={(value) => setForm((current) => ({ ...current, storeName: value }))} />
          <Field label="Store category" value={form.storeCategory} onChange={(value) => setForm((current) => ({ ...current, storeCategory: value }))} />
          <label className="form-field">
            <span className="form-label">Commission percent</span>
            <input className="form-input" value={commissionRate} readOnly />
          </label>
          <label className="form-field">
            <span className="form-label">Number of items</span>
            <input
              className="form-input"
              value={form.itemCount}
              min={5}
              max={15}
              type="number"
              onChange={(event) => setForm((current) => ({ ...current, itemCount: event.target.value }))}
            />
          </label>
          <Field label="Expected average orders" value={form.expectedAverageOrders} onChange={(value) => setForm((current) => ({ ...current, expectedAverageOrders: value }))} />
          <Field label="Email" value={form.contactEmail} onChange={(value) => setForm((current) => ({ ...current, contactEmail: value }))} />
          <Field label="WhatsApp number" value={form.whatsappNumber} onChange={(value) => setForm((current) => ({ ...current, whatsappNumber: value }))} />
        </div>
        {message ? <div className="mt-4 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
        <Button type="button" className="mt-5 w-full" onClick={submitApplication} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit Marketplace Listing Request
        </Button>
      </Card>
    </section>
  );
}

function StatusScreen({ icon, title, body, actions }: { icon: "success" | "pending" | "blocked"; title: string; body: string; actions: ReactNode }) {
  const Icon = icon === "success" ? CheckCircle2 : icon === "blocked" ? XCircle : Clock3;
  const tone = icon === "success" ? "green" : icon === "blocked" ? "red" : "amber";
  return (
    <section className="section-wrap grid min-h-[68vh] place-items-center py-8">
      <Card className="w-full max-w-2xl p-6 text-center sm:p-8">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-fleet-paper text-fleet-ember">
          <Icon className="h-8 w-8" />
        </span>
        <StatusBadge tone={tone} className="mt-5">{icon === "success" ? "accepted" : icon === "blocked" ? "not eligible" : "under review"}</StatusBadge>
        <h1 className="mt-4 text-3xl font-black text-fleet-night">{title}</h1>
        <p className="mx-auto mt-3 max-w-lg text-sm font-semibold leading-7 text-slate-600">{body}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">{actions}</div>
      </Card>
    </section>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-fleet bg-fleet-paper p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-white text-fleet-ember">
        <Store className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <strong className="mt-1 block text-sm font-black text-fleet-night">{value}</strong>
      </span>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
