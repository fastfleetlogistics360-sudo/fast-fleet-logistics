"use client";

import { ArrowRight, Building2, PackageCheck, Route, Smartphone } from "lucide-react";
import { AnimatedDescriptionCards } from "@/components/landing/animated-description-cards";
import type { DescriptionCard } from "@/components/landing/animated-description-cards";
import { LinkButton } from "@/components/ui/button";

const workflowCards: DescriptionCard[] = [
  {
    label: "Dispatch",
    title: "Same-day delivery requests",
    body: "Book verified riders for parcels, food, documents, pharmacy runs, and urgent errands.",
    image: "/hero/same-day-dispatch.svg",
    icon: PackageCheck
  },
  {
    label: "Tracking",
    title: "Live customer visibility",
    body: "Track pickup, assignment, transit, and delivery completion from a clean dashboard.",
    image: "/hero/customer-control.svg",
    icon: Route
  },
  {
    label: "Business",
    title: "Vendor dispatch control",
    body: "Manage repeat logistics for offices, stores, restaurants, and fleet partners.",
    image: "/hero/business-logistics.svg",
    icon: Building2
  }
];

export function AppWorkflowCards() {
  return (
    <AnimatedDescriptionCards
      eyebrow="FastFleet app"
      title="Animated delivery cards for every screen."
      body="The public pages now use the same illustrated card language: swipeable on phones, polished and balanced on laptops."
      cards={workflowCards}
      surface="light"
    >
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <LinkButton href="/auth" size="lg">
          Create account
          <ArrowRight className="h-4 w-4" />
        </LinkButton>
        <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-fleet-line bg-white px-5 text-sm font-black text-fleet-night shadow-[0_12px_28px_rgba(8,17,31,0.06)]">
          <Smartphone className="h-4 w-4 text-fleet-ember" />
          App Store and Google Play coming soon
        </span>
      </div>
    </AnimatedDescriptionCards>
  );
}
