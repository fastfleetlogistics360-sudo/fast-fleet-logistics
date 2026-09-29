import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bike, ShoppingBag, Truck, Warehouse } from "lucide-react";

const path = "/updates/fast-fleets-360-now-live";

export const metadata: Metadata = {
  title: "Fast Fleets 360 Is Now Live",
  description: "Fast Fleets 360 is operational, bringing dispatch, FastErrands, marketplace ordering, restaurant delivery, and logistics tools together in one platform.",
  alternates: { canonical: path },
  openGraph: { title: "Fast Fleets 360 Is Now Live", description: "A public update on Fast Fleets 360 operational services.", url: path, type: "article" }
};

const services = [
  { name: "Delivery and dispatch", detail: "Book a delivery and follow its progress with the platform's customer flow.", href: "/book", icon: Truck },
  { name: "FastErrands", detail: "Request locally sourced everyday essentials with delivery priced at checkout.", href: "/fast-errands", icon: ShoppingBag },
  { name: "Marketplace and restaurants", detail: "Discover local food, shopping, and business listings that are available through the platform.", href: "/shopping", icon: Bike },
  { name: "Heavy logistics and storage", detail: "Request larger transport or explore storage-related functionality where available.", href: "/heavy-logistics", icon: Warehouse }
];

export default function FastFleetsNowLivePage() {
  return <main className="site-canvas">
    <article className="section-wrap py-10 sm:py-16">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Platform update</p>
      <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Fast Fleets 360 is now live.</h1>
      <p className="mt-5 max-w-3xl text-lg font-bold leading-8 text-slate-600">Fast Fleets 360 Logistics is operational, bringing delivery, commerce, and logistics coordination into one public platform.</p>
      <div className="mt-8 max-w-4xl rounded-[24px] border border-fleet-line bg-white p-6 shadow-[0_16px_42px_rgba(8,17,31,0.08)] sm:p-8">
        <p className="text-sm font-semibold leading-7 text-slate-600">Customers can use Fast Fleets 360 to begin delivery and shopping journeys, while businesses and riders have dedicated onboarding and operations tools. Service availability can vary by location and order type; the relevant booking flow presents the options available for a request.</p>
        <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">This is an evergreen operations update, not a claim about a fixed delivery volume or coverage footprint. The platform will continue to evolve as services and local availability expand.</p>
      </div>
      <section className="mt-10" aria-labelledby="available-services"><h2 id="available-services" className="text-2xl font-black text-fleet-night">Services people can discover</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">{services.map(({ name, detail, href, icon: Icon }) => <Link key={name} href={href} className="group rounded-[20px] border border-fleet-line bg-white p-5 shadow-[0_12px_32px_rgba(8,17,31,0.06)] transition hover:-translate-y-0.5 hover:border-fleet-gold"><Icon className="h-6 w-6 text-fleet-ember" /><h3 className="mt-3 text-lg font-black text-fleet-night">{name}</h3><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{detail}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-black text-fleet-ember">Explore <ArrowRight className="h-4 w-4" /></span></Link>)}</div></section>
      <aside className="mt-10 rounded-[24px] bg-fleet-night p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-[0.18em] text-fleet-gold">Partnership news</p><h2 className="mt-2 text-2xl font-black">Fast Fleets 360 × Kwara Media Fashion Week</h2><p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-white/75">Fast Fleets 360 Logistics is the Official Logistics Partner of Kwara Media Fashion Week 1.0.</p><Link href="/partners/kwara-media-fashion-week" className="mt-5 inline-flex items-center gap-2 rounded-[14px] bg-fleet-ember px-4 py-3 text-sm font-black text-white">Read about the partnership <ArrowRight className="h-4 w-4" /></Link></aside>
    </article>
  </main>;
}
