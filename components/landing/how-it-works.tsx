"use client";

import { ClipboardCheck, MapPin, PackageCheck, Route } from "lucide-react";
import { AnimatedDescriptionCards } from "@/components/landing/animated-description-cards";
import type { DescriptionCard } from "@/components/landing/animated-description-cards";

const steps: DescriptionCard[] = [
  {
    label: "Pickup",
    title: "Set pickup location",
    body: "Use your live location or enter an accurate pickup address.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80",
    icon: MapPin
  },
  {
    label: "Type",
    title: "Choose delivery type",
    body: "Select the service and package details for the job.",
    image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=1200&q=80",
    icon: PackageCheck
  },
  {
    label: "Track",
    title: "Track rider live",
    body: "Follow rider movement, ETA, and delivery status in the messenger.",
    image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80",
    icon: Route
  },
  {
    label: "Proof",
    title: "Receive package safely",
    body: "Review the handoff and any required delivery proof.",
    image: "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=1200&q=80",
    icon: ClipboardCheck
  }
];

export function HowItWorks() {
  return (
    <AnimatedDescriptionCards
      eyebrow="How it works"
      title="From pickup to proof, every step stays visible."
      body="Book, track, and confirm delivery in one flow."
      cards={steps}
    />
  );
}
