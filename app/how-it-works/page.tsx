import type { Metadata } from "next";
import Image from "next/image";
import { CheckCircle2, CreditCard, LocateFixed, PackageCheck, Route, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "How Fast Fleets 360 Works",
  description: "How customers, riders, restaurants, shopping vendors, and businesses use Fast Fleets 360 Logistics for city delivery."
};

const steps: Array<{ title: string; body: string; icon: LucideIcon }> = [
  {
    title: "Sign in",
    body: "Choose a customer, rider, or business account to access the tools for your role.",
    icon: UserRound
  },
  {
    title: "Choose a service",
    body: "Book a delivery, order from the marketplace, manage business dispatches, or accept rider jobs.",
    icon: PackageCheck
  },
  {
    title: "Add the route",
    body: "Enter accurate pickup and drop-off addresses, contact details, and package information.",
    icon: LocateFixed
  },
  {
    title: "Review and pay",
    body: "Confirm the route, delivery fee, service details, and payment method before placing the request.",
    icon: CreditCard
  },
  {
    title: "Follow the ongoing job",
    body: "Use the messenger to view rider assignment, live status, ETA, pickup, and delivery updates.",
    icon: Route
  },
  {
    title: "Confirm delivery",
    body: "Complete the handoff, review any required package proof, and keep the final delivery record in your account.",
    icon: CheckCircle2
  }
];

export default function HowItWorksPage() {
  return (
    <main className="bg-fleet-paper">
      <section className="relative isolate overflow-hidden bg-fleet-night text-white">
        <Image
          src="https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=2200&q=76"
          alt=""
          fill
          priority
          sizes="100vw"
          className="absolute inset-0 object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.94),rgba(8,17,31,0.74)_52%,rgba(8,17,31,0.42)),linear-gradient(180deg,rgba(8,17,31,0.16),rgba(8,17,31,0.92))]" />
        <div className="section-wrap relative z-10 grid min-h-[78vh] content-center py-16 sm:py-20">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-gold">How Fast Fleets 360 Works</span>
          <h1 className="mt-4 max-w-4xl text-5xl font-black leading-none text-white sm:text-7xl">
            A clear route from booking to delivery.
          </h1>
          <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-white/[0.82] sm:text-xl">
            Book, pay, follow the ongoing job, and confirm the final handoff from one account.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/book">Book delivery</LinkButton>
            <LinkButton href="/rider/onboarding" variant="secondary">Register as rider</LinkButton>
          </div>
        </div>
      </section>

      <section className="section-wrap py-10 sm:py-14">
        <div className="grid gap-4 md:grid-cols-2">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <Card key={step.title} className="p-5">
                <div className="flex gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-fleet bg-fleet-navy text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Step {index + 1}</span>
                    <h2 className="mt-1 text-xl font-black text-fleet-night">{step.title}</h2>
                    <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">{step.body}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
