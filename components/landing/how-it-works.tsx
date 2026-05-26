"use client";

import { ClipboardCheck, MapPin, PackageCheck, Route } from "lucide-react";
import { AnimatedDescriptionCards } from "@/components/landing/animated-description-cards";
import type { DescriptionCard } from "@/components/landing/animated-description-cards";

const steps: DescriptionCard[] = [
  {
    label: "Pickup",
    title: "Set pickup location",
    body: "Use your live location or enter a pickup address so a FAST FLEETS360 rider knows exactly where to start.",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80",
    icon: MapPin
  },
  {
    label: "Type",
    title: "Choose delivery type",
    body: "Send food, documents, parcels, shopping items, or business dispatch orders with the right service flow.",
    image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=1200&q=80",
    icon: PackageCheck
  },
  {
    label: "Track",
    title: "Track rider live",
    body: "Stay close to the route with delivery status, rider movement, ETA, and handoff progress.",
    image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80",
    icon: Route
  },
  {
    label: "Proof",
    title: "Receive package safely",
    body: "FAST FLEETS360 keeps the delivery visible until the package reaches the right person.",
    image: "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=1200&q=80",
    icon: ClipboardCheck
  }
];

export function HowItWorks() {
  return (
    <AnimatedDescriptionCards
      eyebrow="How it works"
      title="From pickup to proof, FAST FLEETS360 keeps it clear."
      body="A clean delivery flow for customers, vendors, businesses, and riders moving across the city."
      cards={steps}
    />
  );
}
