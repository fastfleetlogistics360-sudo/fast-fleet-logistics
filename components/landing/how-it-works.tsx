"use client";

import { MapPin, PackageCheck, Route, UserCheck } from "lucide-react";
import { AnimatedDescriptionCards } from "@/components/landing/animated-description-cards";
import type { DescriptionCard } from "@/components/landing/animated-description-cards";

const steps: DescriptionCard[] = [
  {
    label: "Pickup",
    title: "Set pickup and drop-off",
    body: "Add clear addresses for city movement, vendor dispatch, and scheduled delivery routes.",
    image: "/hero/customer-control.svg",
    icon: MapPin
  },
  {
    label: "Mode",
    title: "Choose bike, car, or van",
    body: "Match the delivery mode to urgency, route, package size, and customer expectations.",
    image: "/hero/same-day-dispatch.svg",
    icon: PackageCheck
  },
  {
    label: "Rider",
    title: "Match a verified partner",
    body: "Nearby approved riders receive delivery context with route, distance, and earning details.",
    image: "/hero/trusted-network.svg",
    icon: UserCheck
  },
  {
    label: "Track",
    title: "Follow it to completion",
    body: "Watch status, ETA, rider movement, and delivery proof until the job is closed.",
    image: "/hero/business-logistics.svg",
    icon: Route
  }
];

export function HowItWorks() {
  return (
    <AnimatedDescriptionCards
      eyebrow="How it works"
      title="Request, match, track, deliver."
      body="Swipe the FastFleet delivery flow on mobile, or scan the full card set from any laptop screen."
      cards={steps}
    />
  );
}
