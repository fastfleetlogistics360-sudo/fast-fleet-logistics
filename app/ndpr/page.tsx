import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NDPR Compliance",
  description: "Fast Fleets 360 Logistics NDPR compliance statement for Nigerian data protection expectations."
};

export default function NdprPage() {
  return (
    <section className="section-wrap py-10">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">NDPR compliance</span>
      <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-fleet-night sm:text-6xl">Fast Fleets 360 data protection statement.</h1>
      <div className="mt-8 grid gap-5 text-sm font-semibold leading-7 text-slate-600">
        <p>Fast Fleets 360 is designed around Nigerian data protection expectations, including transparency, purpose limitation, security, data minimization, and user rights.</p>
        <p>Delivery, rider KYC, wallet, support, and account records are collected only for platform operations, safety, fraud prevention, payment verification, customer support, and legal or accounting obligations.</p>
        <p>Users can request access, correction, export, restriction, or deletion through support. Some records may be retained where required for disputes, fraud review, tax, accounting, or legal compliance.</p>
      </div>
    </section>
  );
}
