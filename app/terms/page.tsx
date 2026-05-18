import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "FastFleet Logistics terms for customers, riders, payments, prohibited items, disputes, wallet use, and account deletion."
};

export default function TermsPage() {
  return (
    <section className="section-wrap py-10">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Terms of Service</span>
      <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-fleet-night sm:text-6xl">The rules for using FastFleet.</h1>
      <div className="mt-8 grid gap-5 text-sm font-semibold leading-7 text-slate-600">
        <p>Customers must provide accurate account, pickup, delivery, recipient, and payment details. Packages must be lawful, properly packed, and ready for pickup.</p>
        <p>Riders must provide accurate KYC, vehicle, zone, and payout details, protect packages, and follow delivery safety and platform rules.</p>
        <p>FastFleet prohibits illegal goods, weapons, controlled substances, stolen items, hazardous materials, cash bundles, and items barred by law or platform policy. Disputes are handled through support using tracking, payment, and route records.</p>
      </div>
    </section>
  );
}
