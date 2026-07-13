import type { Metadata } from "next";
import Image from "next/image";
import { Bike, Building2, CheckCircle2, CreditCard, LocateFixed, PackageCheck, Route, ShoppingBag, UserRound, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "How Fast Fleets 360 Works",
  description: "How customers, riders, restaurants, shopping vendors, and businesses use Fast Fleets 360 Logistics for city delivery."
};

const steps: Array<{ title: string; body: string; icon: LucideIcon }> = [
  {
    title: "Create or Sign In to Your Account",
    body: "Start by creating an account or signing in securely. Fast Fleets 360 gives customers, riders, and business partners access to the right dashboard for their role, making booking, tracking, onboarding, payouts, and order management easier from one platform.",
    icon: UserRound
  },
  {
    title: "Choose What You Want to Do",
    body: "Fast Fleets 360 is built for different delivery needs. You can book a same-day dispatch, order food from restaurant partners, shop from category vendors, track a package, register as a rider, or create a business dispatch account.",
    icon: ShoppingBag
  },
  {
    title: "Enter Pickup and Drop-off Details",
    body: "For normal delivery, you can use your live location or enter a pickup address, then add the drop-off location. The platform shows your estimated distance and delivery fee before you continue, giving you clear pricing before booking.",
    icon: LocateFixed
  },
  {
    title: "Confirm Your Delivery Fee",
    body: "Fast Fleets 360 shows a delivery estimate based on route distance, plus a fixed platform fee, so customers know the total cost before placing an order.",
    icon: CreditCard
  },
  {
    title: "Place Your Order or Delivery Request",
    body: "Customers can book riders for food, documents, parcels, shopping items, business dispatch, and urgent errands. Restaurant customers can select meals, add items to cart, confirm delivery details, and checkout through Squad. Shopping customers can choose a category, select a vendor, add vendor-specific products, and checkout.",
    icon: PackageCheck
  },
  {
    title: "A Rider Handles the Delivery",
    body: "Fast Fleets 360 connects delivery requests to riders for fast city movement. Riders can onboard, complete verification, receive delivery opportunities, manage earnings, and grow as independent delivery partners.",
    icon: Bike
  },
  {
    title: "Track the Delivery Live",
    body: "After dispatch, customers and businesses can follow the delivery status, rider movement, ETA, and package progress from pickup to final handoff.",
    icon: Route
  },
  {
    title: "Receive Your Package Safely",
    body: "Fast Fleets 360 keeps the delivery visible until the package reaches the right person. The platform is designed to support safer package movement, clear handoff progress, and dependable delivery confidence.",
    icon: CheckCircle2
  },
  {
    title: "Businesses Can Manage Orders Better",
    body: "Restaurants, shopping vendors, offices, and stores can register as business partners to receive orders, support repeat dispatch, and give their customers a more reliable delivery experience.",
    icon: Building2
  },
  {
    title: "Riders Can Earn With Fast Fleets 360",
    body: "Riders can create a rider account, complete KYC verification, upload required documents, receive approval, accept delivery opportunities, manage earnings, and request withdrawals.",
    icon: WalletCards
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
            City delivery made simple, fast, and reliable.
          </h1>
          <p className="mt-6 max-w-3xl text-base font-semibold leading-8 text-white/[0.82] sm:text-xl">
            Fast Fleets 360 Logistics makes city delivery simple, fast, and reliable for customers, riders, restaurants, shopping vendors, and businesses across Lagos and Ogun.
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

        <div className="mt-6 rounded-fleet bg-fleet-night p-6 text-white sm:p-8">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-gold">In Simple Terms</span>
          <p className="mt-3 max-w-4xl text-2xl font-black leading-tight sm:text-4xl">
            Fast Fleets 360 helps people send packages, order food, shop from category vendors, track riders live, and connect businesses with verified delivery riders all from one logistics platform.
          </p>
        </div>
      </section>
    </main>
  );
}
