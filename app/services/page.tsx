import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bike, BriefcaseBusiness, ShoppingBag, Truck } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";

export const metadata: Metadata = {
  title: "Services"
};

const services = [
  { title: "Marketplace", body: "Order food, groceries, and everyday essentials from local businesses.", href: "/shopping", icon: ShoppingBag, label: "Explore marketplace" },
  { title: "Delivery", body: "Send parcels with clear pricing and live status updates.", href: "/book", icon: Truck, label: "Book a delivery" },
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
