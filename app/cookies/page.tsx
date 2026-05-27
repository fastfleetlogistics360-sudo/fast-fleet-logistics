import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie and Data Consent",
  description: "Fast Fleets 360 Logistics cookie and local storage notice for sessions, consent, wallet preview data, and delivery preferences."
};

export default function CookiesPage() {
  return (
    <section className="section-wrap py-10">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Cookie and data consent</span>
      <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-fleet-night sm:text-6xl">How Fast Fleets 360 remembers your preferences.</h1>
      <div className="mt-8 grid gap-5 text-sm font-semibold leading-7 text-slate-600">
        <p>Fast Fleets 360 uses essential browser storage for sign-in sessions, wallet preview state, delivery drafts, cookie consent, and dashboard continuity.</p>
        <p>When live services are enabled, Supabase may store authentication/session details and Paystack may process payment references needed to verify wallet funding and receipts.</p>
        <p>You can clear browser storage from your device settings. Removing essential storage may sign you out or reset delivery drafts and local preview records.</p>
      </div>
    </section>
  );
}
