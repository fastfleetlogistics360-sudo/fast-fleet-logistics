import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "FastFleet Logistics privacy policy for location data, payments, rider KYC, Supabase storage, account deletion, and support records."
};

export default function PrivacyPage() {
  return (
    <section className="section-wrap py-10">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Privacy Policy</span>
      <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-fleet-night sm:text-6xl">How FastFleet handles user data.</h1>
      <div className="mt-8 grid gap-5 text-sm font-semibold leading-7 text-slate-600">
        <p>FastFleet collects account details, delivery addresses, support messages, wallet/payment references, location data used for pickup and tracking, and rider KYC details such as vehicle information, payout details, documents, and NIN where required.</p>
        <p>We use Supabase for authentication, database records, file storage, and sessions; Paystack for payment verification; and map/location providers for route previews and delivery tracking.</p>
        <p>Users may request access, correction, export, or deletion through the dashboard deletion control or support. Active deliveries, disputes, fraud checks, and legally required payment records may need review before final deletion.</p>
      </div>
    </section>
  );
}
