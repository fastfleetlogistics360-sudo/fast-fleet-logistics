import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bike, BriefcaseBusiness, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";

export const metadata: Metadata = {
  title: "Services"
};

const services = [
  { title: "Marketplace", body: "Discover food, groceries, and everyday essentials from onboarding marketplace partners.", href: "/shopping-mall", icon: ShoppingBag, label: "Explore marketplace" },
  { title: "Delivery Services", body: "Book a dependable parcel or business dispatch with clear status updates from pickup to handoff.", href: "/book", icon: Truck, label: "Book a delivery" },
  { title: "Business Solutions", body: "Give your business a dispatch workspace for repeat jobs, teams, billing, and delivery operations.", href: "/business/register", icon: BriefcaseBusiness, label: "Register a business" },
  { title: "Rider Opportunities", body: "Join the delivery network, complete onboarding, and manage your rider application securely.", href: "/rider/onboarding", icon: Bike, label: "Become a rider" },
  { title: "Future Offerings", body: "We are building more tools for local commerce, partner operations, and connected delivery journeys.", href: "/updates", icon: PackageCheck, label: "See updates" }
];

export default function ServicesPage() {
  return (
    <>
      <CinematicPageHero
        eyebrow="Fast Fleets 360 services"
        title="One platform for moving what matters."
        body="From a single parcel to a growing storefront, choose the Fast Fleets experience that fits your day."
        image="https://images.unsplash.com/photo-1580674684081-7617fbf3d745?auto=format&fit=crop&w=2200&q=84"
      />
      <section className="section-wrap py-10 sm:py-14">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <article key={service.title} className="flex min-h-56 flex-col border-t-2 border-fleet-gold bg-white p-5 shadow-[0_12px_30px_rgba(8,17,31,0.06)] sm:p-6">
                <span className="grid h-11 w-11 place-items-center rounded-fleet bg-fleet-navy text-white"><Icon className="h-5 w-5" /></span>
                <h2 className="mt-5 text-xl font-black text-fleet-night">{service.title}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{service.body}</p>
                <Link href={service.href} className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-black text-fleet-ember transition hover:text-fleet-night">
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
