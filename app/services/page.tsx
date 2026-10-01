import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bike, BriefcaseBusiness, Camera, ShoppingBag, Truck, WalletCards, Warehouse } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";

export const metadata: Metadata = {
  title: "Delivery, Marketplace & Logistics Services",
  description: "Explore Fast Fleets 360 delivery, FastErrands, marketplace, restaurant delivery, heavy logistics, storage, business dispatch, and rider services.",
  alternates: { canonical: "/services" },
  openGraph: { title: "Fast Fleets 360 Services", description: "Delivery, marketplace, FastErrands, business dispatch, and logistics services.", url: "/services" }
};

const services = [
  { title: "Marketplace", body: "Order food, groceries, and everyday essentials from local businesses.", href: "/shopping", icon: ShoppingBag, label: "Explore marketplace" },
  { title: "FastErrands", body: "Buy from a verified store with a protected purchase budget—never rider cash.", href: "/fast-errands", icon: WalletCards, label: "Start a FastErrand" },
  { title: "FastConfirm™", body: "Review the pickup photo before your delivery continues, helping you confirm the right package is on the way.", href: "/fastconfirm", icon: Camera, label: "Explore FastConfirm" },
  { title: "Delivery", body: "Send parcels with clear pricing and live status updates.", href: "/book", icon: Truck, label: "Book a delivery" },
  { title: "Heavy Logistics", body: "Request transport for building materials, furniture, bulk goods, and more.", href: "/heavy-logistics", icon: Warehouse, label: "Request transport" },
  { title: "Business Dispatch", body: "Manage repeat deliveries, customer orders, teams, and payouts.", href: "/business/register", icon: BriefcaseBusiness, label: "Register a business" },
  { title: "Rider Network", body: "Apply, complete verification, and manage delivery work in one place.", href: "/rider/onboarding", icon: Bike, label: "Become a rider" }
];

export default function ServicesPage() {
  return (
    <>
      <CinematicPageHero
        eyebrow="Fast Fleets 360 services"
        title="One platform for moving what matters."
        body="Delivery services for customers, riders, and businesses."
        image="https://images.unsplash.com/photo-1580674684081-7617fbf3d745?auto=format&fit=crop&w=2200&q=84"
      />
      <section className="section-wrap py-8 sm:py-10">
        <aside className="mb-5 flex flex-col gap-3 rounded-[20px] border border-fleet-ember/25 bg-orange-50/80 p-5 shadow-[0_14px_36px_rgba(244,126,24,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Now serving Oyo State</p>
            <h2 className="mt-1 text-xl font-black text-fleet-night">Explore all Fast Fleets 360 services available in Oyo.</h2>
          </div>
          <Link href="/locations/oyo-state" className="inline-flex shrink-0 items-center gap-2 text-sm font-black text-fleet-ember transition hover:text-fleet-night">
            Oyo service coverage <ArrowUpRight className="h-4 w-4" />
          </Link>
        </aside>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <article key={service.title} className="flex min-h-48 flex-col rounded-[20px] border border-white/80 bg-white/[0.90] p-4 shadow-[0_16px_42px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl sm:p-5">
                <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-fleet-navy text-white"><Icon className="h-4 w-4" /></span>
                <h2 className="mt-4 text-lg font-black text-fleet-night">{service.title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{service.body}</p>
                <Link href={service.href} className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-black text-fleet-ember transition hover:text-fleet-night">
                  {service.label}<ArrowUpRight className="h-4 w-4" />
                </Link>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
