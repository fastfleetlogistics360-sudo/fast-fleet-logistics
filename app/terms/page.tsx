import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "FastFleet Logistics terms covering eligibility, accounts, prohibited items, cancellations, refunds, liability, disputes, and Nigerian governing law."
};

const terms = [
  {
    title: "1. Eligibility",
    body: "FastFleet is available to users who are at least 18 years old, capable of entering a binding agreement, and resident or operating in Nigeria. Riders and business users must provide accurate onboarding, KYC, payout, and operational information before using restricted services."
  },
  {
    title: "2. Account responsibilities",
    body: "You are responsible for maintaining the confidentiality of your login details, OTPs, devices, team member access, wallet usage, and all activity under your account. You must provide accurate names, phone numbers, pickup details, drop-off details, package information, payment references, and support information."
  },
  {
    title: "3. Delivery rules",
    body: "Packages must be lawful, safe, properly packed, and ready at pickup. FastFleet may reject, cancel, inspect, delay, or report deliveries where fraud, safety, prohibited items, regulatory issues, or inaccurate information are suspected."
  },
  {
    title: "4. Prohibited items",
    body: "You must not send weapons, ammunition, explosives, illegal drugs, controlled substances without lawful authorisation, stolen items, counterfeit goods, cash bundles, live animals, hazardous chemicals, flammable materials, human remains, pornography involving minors, regulated medical products without approval, or any item prohibited by Nigerian law or FastFleet policy."
  },
  {
    title: "5. Cancellation and refunds",
    body: "A customer may cancel within 5 minutes of booking for a full refund if no rider has picked up the package. After a rider is assigned but before pickup, FastFleet may deduct reasonable rider-arrival or processing costs where permitted. After pickup, delivery fees are not refundable except where FastFleet confirms a platform-caused failure. Wallet refunds may be returned to the wallet balance or original payment channel depending on the transaction, payment provider timing, and fraud checks."
  },
  {
    title: "6. Payments and wallets",
    body: "FastFleet may use Paystack and wallet balances to collect delivery fees, top-ups, and payout references. Users are responsible for ensuring payment information and bank details are correct. Rider withdrawals may be reviewed before payout."
  },
  {
    title: "7. Limitation of liability",
    body: "To the fullest extent permitted by law, FastFleet is not liable for indirect, incidental, special, punitive, or consequential losses, including loss of profit, business interruption, missed events, emotional distress, or losses caused by inaccurate sender or recipient information. FastFleet's aggregate liability for a delivery is limited to the delivery fee paid for that delivery unless Nigerian law requires otherwise."
  },
  {
    title: "8. Suspension and termination",
    body: "FastFleet may suspend or terminate accounts that violate these terms, create safety risks, submit false KYC details, misuse wallets, abuse support, commit fraud, or send prohibited items. Users may delete their account in-app from the dashboard account tab."
  },
  {
    title: "9. Dispute resolution",
    body: "Users should contact FastFleet support first with the order ID, payment reference, and supporting information. If the issue cannot be resolved through support, disputes will proceed to arbitration in Lagos State, Nigeria, unless applicable law requires another forum."
  },
  {
    title: "10. Governing law",
    body: "These terms are governed by the laws of the Federal Republic of Nigeria. Version 1.0 is effective from May 22, 2026."
  },
  {
    title: "11. Notices and updates",
    body: "FastFleet may update these terms when products, fees, payment providers, safety rules, or legal obligations change. Material updates will be posted in-app or on this page. Questions about these terms, cancellations, refunds, or account closure can be sent to support@fastfleet.com.ng."
  }
];

export default function TermsPage() {
  return (
    <section className="section-wrap py-10">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Terms of Service</span>
      <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-fleet-night sm:text-6xl">The rules for using FastFleet.</h1>
      <p className="mt-4 text-sm font-bold text-slate-500">Effective date: May 22, 2026 · Version 1.0</p>
      <div className="mt-8 grid gap-5">
        {terms.map((term) => (
          <article key={term.title} className="rounded-fleet border border-fleet-line bg-white p-5">
            <h2 className="text-xl font-black text-fleet-night">{term.title}</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">{term.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
