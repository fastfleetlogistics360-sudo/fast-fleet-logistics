import type { Metadata } from "next";
import { Bike, Gift, Share2, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";

const path = "/refer-and-win";
const pageUrl = `https://fastfleet.com.ng${path}`;

export const metadata: Metadata = {
  title: "Refer & Win Rewards Programme",
  description: "Invite customers or cyclists to Fast Fleets 360 and earn referral rewards when they complete the qualifying activity. Join the Fast Fleets 360 Refer & Win programme.",
  keywords: ["Fast Fleets 360 Refer and Win", "Fast Fleets referral programme", "Nigeria referral rewards", "refer a cyclist Nigeria", "delivery referral rewards"],
  alternates: { canonical: path },
  openGraph: {
    title: "Refer & Win with Fast Fleets 360",
    description: "Invite customers or cyclists and earn rewards when they qualify.",
    url: path,
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Refer & Win with Fast Fleets 360",
    description: "Invite customers or cyclists and earn rewards when they qualify."
  },
  robots: { index: true, follow: true }
};

const programmeSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: "Fast Fleets 360 Refer & Win Rewards Programme",
      description: "Invite customers or cyclists to Fast Fleets 360 and earn referral rewards when they complete the qualifying activity.",
      isPartOf: { "@type": "WebSite", "@id": "https://fastfleet.com.ng/#website", name: "Fast Fleets 360 Logistics", url: "https://fastfleet.com.ng" },
      about: { "@id": "https://fastfleet.com.ng/#organization" },
      inLanguage: "en-NG"
    },
    {
      "@type": "HowTo",
      name: "How Fast Fleets 360 Refer & Win works",
      description: "Share a referral link, let the invited person join Fast Fleets 360, and receive a reward after the relevant qualification is complete.",
      step: [
        { "@type": "HowToStep", position: 1, name: "Get your referral link", text: "Sign in to your Fast Fleets 360 account and open Refer & Win." },
        { "@type": "HowToStep", position: 2, name: "Share an invitation", text: "Share a customer or cyclist referral link with someone you know." },
        { "@type": "HowToStep", position: 3, name: "Earn when they qualify", text: "A customer reward unlocks after their first qualifying activity. A cyclist reward unlocks after approval, activation, and a first completed delivery." }
      ]
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://fastfleet.com.ng/" },
        { "@type": "ListItem", position: 2, name: "Refer & Win", item: pageUrl }
      ]
    }
  ]
};

const steps = [
  { icon: Share2, label: "Share", body: "Send a customer or cyclist referral link from your account." },
  { icon: Gift, label: "They qualify", body: "Customers complete a qualifying activity; cyclists are approved and complete a first delivery." },
  { icon: WalletCards, label: "Move your reward", body: "When available, transfer your earned reward to your Fast Fleets wallet." }
];

export default function ReferAndWinPage() {
  return (
    <main className="bg-fleet-paper">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(programmeSchema) }} />
      <section className="bg-fleet-night text-white">
        <div className="section-wrap py-14 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-fleet-gold"><Gift className="h-4 w-4" /> Fast Fleets 360 Refer & Win</span>
          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Invite people. Earn real rewards.</h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-white/80 sm:text-lg">Refer customers or bicycle riders to Fast Fleets 360. Your reward becomes available when the person you invited completes the qualifying real-world activity.</p>
          <div className="mt-8 flex flex-wrap gap-3"><LinkButton href="/auth?returnTo=/referrals">Open Refer & Win</LinkButton><LinkButton href="/how-it-works" variant="secondary">Explore Fast Fleets 360</LinkButton></div>
        </div>
      </section>

      <section className="section-wrap py-10 sm:py-14">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5 sm:p-6"><span className="grid h-11 w-11 place-items-center rounded-[14px] bg-amber-50 text-fleet-ember"><Gift className="h-5 w-5" /></span><p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Refer a customer</p><h2 className="mt-1 text-2xl font-black text-fleet-night">Earn ₦1,000</h2><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Share your customer link. The reward becomes available after the invited person completes their first qualifying activity.</p></Card>
          <Card className="p-5 sm:p-6"><span className="grid h-11 w-11 place-items-center rounded-[14px] bg-amber-50 text-fleet-ember"><Bike className="h-5 w-5" /></span><p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Refer a cyclist</p><h2 className="mt-1 text-2xl font-black text-fleet-night">Earn ₦5,000</h2><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Share your cyclist link. The reward becomes available after approval, rider activation, and their first completed delivery.</p></Card>
        </div>
      </section>

      <section className="border-y border-fleet-line bg-white"><div className="section-wrap py-10 sm:py-14"><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">How it works</span><h2 className="mt-2 max-w-2xl text-3xl font-black text-fleet-night sm:text-4xl">A simple referral programme built around real activity.</h2><div className="mt-7 grid gap-4 md:grid-cols-3">{steps.map((step, index) => { const Icon = step.icon; return <div key={step.label} className="rounded-[18px] bg-fleet-paper p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-fleet-night text-white"><Icon className="h-4 w-4" /></span><p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Step {index + 1}</p><h3 className="mt-1 text-lg font-black text-fleet-night">{step.label}</h3><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{step.body}</p></div>; })}</div></div></section>

      <section className="section-wrap py-10 sm:py-14"><div className="max-w-3xl"><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Programme details</span><h2 className="mt-2 text-3xl font-black text-fleet-night">Questions about rewards?</h2><div className="mt-5 grid gap-3"><Faq question="When does a customer reward become available?" answer="It becomes available after the referred customer completes their first qualifying Fast Fleets 360 activity." /><Faq question="When does a cyclist reward become available?" answer="It becomes available after the referred cyclist is approved, activated as a rider, and completes their first delivery." /><Faq question="Where do I find my referral links?" answer="Sign in, open Refer & Win, and use the customer or cyclist link assigned to your account." /></div></div></section>
    </main>
  );
}

function Faq({ question, answer }: { question: string; answer: string }) {
  return <details className="group rounded-[18px] border border-fleet-line bg-white px-4 py-3"><summary className="cursor-pointer list-none text-sm font-black text-fleet-night">{question}</summary><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{answer}</p></details>;
}
