import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "FastFleet Logistics privacy policy for account data, location data, payments, rider KYC, retention, user rights, cookies, and NDPR compliance."
};

const sections = [
  {
    title: "1. Data we collect",
    body: "FastFleet collects account details such as name, email, phone number, account type, profile photo, saved addresses, delivery addresses, order history, support messages, notification preferences, and device/session information. We collect delivery location data needed for pickup, drop-off, rider assignment, live tracking, proof of delivery, fraud prevention, and customer support. Payment card data is not stored by FastFleet; we store Paystack payment references, wallet transactions, receipts, and payout records. Rider and business onboarding may require vehicle details, government ID documents, licence documents, insurance, guarantor records, bank details, BVN verification data, and review decisions."
  },
  {
    title: "2. Why we collect it",
    body: "We use this data to create accounts, authenticate users, deliver packages, match riders to orders, calculate prices, process wallet payments, verify riders and businesses, prevent fraud, respond to support requests, meet legal obligations, improve reliability, send service notifications, and maintain audit records required for financial and regulatory compliance."
  },
  {
    title: "3. Service providers and sharing",
    body: "We share data only where needed to operate FastFleet. Supabase provides authentication, database, storage, sessions, and realtime infrastructure. Paystack processes payments, bank verification, wallet top-ups, and payout references. Map and location providers may process pickup, drop-off, route, and approximate location information to support dispatch and tracking. We may share limited records with regulators, law enforcement, payment partners, insurers, or dispute-resolution bodies when required by law or to protect users."
  },
  {
    title: "4. Retention",
    body: "Active account records are retained while the account remains active. When an account is deleted in-app, FastFleet flags the profile with deleted_at, removes direct contact fields, signs the user out, and queues the account for hard deletion after 90 days. Some payment, tax, transaction, fraud, dispute, and safety records may be retained for up to 7 years where Nigerian tax, accounting, anti-fraud, or legal obligations require it."
  },
  {
    title: "5. User rights",
    body: "You may request access, correction, export, deletion, objection, or restriction of your personal data. You can update profile details inside the dashboard, use the in-app Delete my account control, or contact FastFleet for a data request. We may ask for identity verification before actioning sensitive requests."
  },
  {
    title: "6. Cookies and local storage",
    body: "FastFleet uses cookies and local storage to keep users signed in, remember preferences, support PWA offline behaviour, store non-sensitive draft booking data, improve performance, and protect sessions. You can clear browser storage, but some app features may stop working until you sign in again."
  },
  {
    title: "7. Security",
    body: "We use Supabase Row Level Security, authenticated access controls, encrypted transport, role checks, storage policies, and operational review workflows to reduce unauthorised access. No internet service can guarantee absolute security, so users should protect passwords, OTPs, and devices."
  },
  {
    title: "8. Children",
    body: "FastFleet is intended for users who are at least 18 years old. We do not knowingly onboard children as customers, riders, business operators, or team members."
  },
  {
    title: "9. Governing law and regulator",
    body: "This policy is governed by the laws of the Federal Republic of Nigeria, the Nigeria Data Protection Regulation, and applicable guidance from NITDA and relevant Nigerian data-protection authorities."
  },
  {
    title: "10. Contact",
    body: "For privacy requests, corrections, export, restriction, or deletion questions, contact privacy@fastfleet.com.ng."
  }
];

export default function PrivacyPage() {
  return (
    <section className="section-wrap py-10">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Privacy Policy</span>
      <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-fleet-night sm:text-6xl">How FastFleet handles user data.</h1>
      <p className="mt-4 text-sm font-bold text-slate-500">Last updated: May 22, 2026</p>
      <div className="mt-8 grid gap-5">
        {sections.map((section) => (
          <article key={section.title} className="rounded-fleet border border-fleet-line bg-white p-5">
            <h2 className="text-xl font-black text-fleet-night">{section.title}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{section.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
