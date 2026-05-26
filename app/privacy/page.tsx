import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "FAST FLEETS360 Logistics privacy policy for account data, location data, payments, rider KYC, retention, user rights, cookies, and NDPR compliance."
};

const sections = [
  {
    title: "1. Data we collect",
    body: "FAST FLEETS360 collects account details such as name, email, phone number, account type, profile photo, saved addresses, delivery addresses, order history, support messages, notification preferences, and device/session information. We collect delivery location data needed for pickup, drop-off, rider assignment, live tracking, proof of delivery, fraud prevention, and customer support. Payment card data is not stored by FAST FLEETS360; we store Paystack payment references, wallet transactions, receipts, and payout records. Rider and business onboarding may require vehicle details, government ID documents, licence documents, insurance, guarantor records, bank details, and review decisions."
  },
  {
    title: "2. Why we collect it",
    body: "We use this data to create accounts, authenticate users, deliver packages, match riders to orders, calculate prices, process wallet payments, verify riders and businesses, prevent fraud, respond to support requests, meet legal obligations, improve reliability, send service notifications, and maintain audit records required for financial and regulatory compliance."
  },
  {
    title: "3. Service providers and sharing",
    body: "We share data only where needed to operate FAST FLEETS360. Supabase provides authentication, database, storage, sessions, and realtime infrastructure. Paystack processes payments, bank verification, wallet top-ups, and payout references. Map and location providers may process pickup, drop-off, route, and approximate location information to support dispatch and tracking. We may share limited records with regulators, law enforcement, payment partners, insurers, or dispute-resolution bodies when required by law or to protect users."
  },
  {
    title: "4. Retention periods",
    body: "Active account profile records are retained while the account remains active. Booking drafts and support chat metadata are normally retained for up to 24 months. Delivery records, proof of delivery, rider assignment logs, wallet transactions, refund records, payout records, fraud signals, and dispute evidence may be retained for up to 7 years where Nigerian tax, accounting, payment, safety, anti-fraud, or legal obligations require it. When an account is deleted in-app, FAST FLEETS360 flags the profile with deleted_at, removes direct contact fields, signs the user out, and queues eligible account data for hard deletion after 90 days."
  },
  {
    title: "5. User rights",
    body: "Under the Nigeria Data Protection Act 2023 and applicable NDPR/NDPC guidance, you may request access, correction, export, deletion, objection, restriction of processing, withdrawal of consent where processing relies on consent, and information about automated processing. You may also lodge a complaint with the Nigeria Data Protection Commission. You can update profile details inside the dashboard, use the in-app Delete my account control, or contact FAST FLEETS360 for a data request. We may ask for identity verification before actioning sensitive requests."
  },
  {
    title: "6. Cookies and local storage",
    body: "FAST FLEETS360 uses cookies and local storage to keep users signed in, remember preferences, support PWA offline behaviour, store non-sensitive draft booking data, improve performance, and protect sessions. You can clear browser storage, but some app features may stop working until you sign in again."
  },
  {
    title: "7. Security",
    body: "We use Supabase Row Level Security, authenticated access controls, encrypted transport, role checks, storage policies, and operational review workflows to reduce unauthorised access. No internet service can guarantee absolute security, so users should protect passwords, OTPs, and devices."
  },
  {
    title: "8. Children",
    body: "FAST FLEETS360 is intended for users who are at least 18 years old. We do not knowingly onboard children as customers, riders, business operators, or team members."
  },
  {
    title: "9. Governing law and regulator",
    body: "This policy is governed by the laws of the Federal Republic of Nigeria, including the Nigeria Data Protection Act 2023, the Nigeria Data Protection Regulation, and applicable guidance from the Nigeria Data Protection Commission, NITDA, and relevant Nigerian data-protection authorities."
  },
  {
    title: "10. Contact",
    body: "For privacy requests, corrections, export, restriction, deletion questions, or data-protection complaints, contact privacy@fastfleet.com.ng or support@fastfleet.com.ng. Postal and company registration contact details should be added here before final store submission if FAST FLEETS360 operates through a registered legal entity."
  }
];

export default function PrivacyPage() {
  return (
    <section className="section-wrap py-10">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Privacy Policy</span>
      <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-fleet-night sm:text-6xl">How FAST FLEETS360 handles user data.</h1>
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
