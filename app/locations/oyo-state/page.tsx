import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bike, BriefcaseBusiness, Camera, ShoppingBag, Truck, WalletCards, Warehouse } from "lucide-react";

export const metadata: Metadata = {
  title: "Delivery & Logistics Services in Oyo State",
  description: "Fast Fleets 360 is live in Oyo State for dispatch, FastErrands, restaurant and shopping orders, business deliveries, heavy logistics, storage, and rider services.",
  keywords: [
    "Fast Fleets 360 Oyo State",
    "Oyo delivery service",
    "Oyo dispatch rider",
    "Oyo restaurant delivery",
    "Oyo shopping delivery",
    "Oyo logistics service",
    "FastErrands Oyo"
  ],
  alternates: { canonical: "/locations/oyo-state" },
  openGraph: {
    title: "Fast Fleets 360 is Live in Oyo State",
    description: "Book delivery, shop local, send FastErrands, and manage logistics with Fast Fleets 360 in Oyo State.",
    url: "/locations/oyo-state",
    type: "website"
  }
};

const services = [
  { title: "Dispatch delivery", body: "Send parcels and follow every stage of the delivery.", href: "/book", icon: Truck, label: "Book a delivery" },
  { title: "FastErrands", body: "Request a protected purchase and delivery from a verified store.", href: "/fast-errands", icon: WalletCards, label: "Start a FastErrand" },
  { title: "Restaurant delivery", body: "Browse participating restaurants and have meals delivered.", href: "/restaurants", icon: ShoppingBag, label: "Order food" },
  { title: "Shopping delivery", body: "Order everyday essentials from participating local vendors.", href: "/shopping", icon: ShoppingBag, label: "Start shopping" },
  { title: "FastConfirm™", body: "Review a pickup photo before a delivery continues when confirmation is needed.", href: "/fastconfirm", icon: Camera, label: "Explore FastConfirm" },
  { title: "Heavy logistics", body: "Request transport for bulky and larger items.", href: "/heavy-logistics", icon: Warehouse, label: "Request transport" },
  { title: "Business dispatch", body: "Manage repeat deliveries and customer orders from one platform.", href: "/business/register", icon: BriefcaseBusiness, label: "Register a business" },
  { title: "Rider network", body: "Apply to deliver and manage delivery work through Fast Fleets 360.", href: "/rider/onboarding", icon: Bike, label: "Become a rider" }
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "LocalBusiness",
      name: "Fast Fleets 360 Logistics",
      url: "https://fastfleet.com.ng/locations/oyo-state",
      description: "Fast Fleets 360 delivery, marketplace, and logistics services available in Oyo State, Nigeria.",
      areaServed: { "@type": "AdministrativeArea", name: "Oyo State, Nigeria" },
      parentOrganization: { "@id": "https://fastfleet.com.ng/#organization" }
    },
    {
      "@type": "ItemList",
      name: "Fast Fleets 360 services in Oyo State",
      itemListElement: services.map((service, position) => ({
        "@type": "ListItem",
        position: position + 1,
        name: service.title,
        url: `https://fastfleet.com.ng${service.href}`
      }))
    }
  ]
};

export default function OyoStateLocationPage() {
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[radial-gradient(circle_at_top_right,rgba(244,126,24,0.15),transparent_30%),linear-gradient(180deg,#f8fafc,#eef3f8)] pb-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <section className="section-wrap py-10 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-fleet-ember">Fast Fleets 360 in Oyo State</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-fleet-night sm:text-6xl">Delivery, shopping, and logistics—now live in Oyo.</h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-slate-600 sm:text-lg">Fast Fleets 360 connects customers, businesses, and riders across Oyo State with services for moving parcels, buying essentials, ordering meals, and managing larger logistics needs.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/book" className="inline-flex min-h-12 items-center gap-2 rounded-fleet bg-fleet-ember px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(244,126,24,0.24)] transition hover:bg-orange-600">Book a delivery <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/main" className="inline-flex min-h-12 items-center rounded-fleet border border-fleet-line bg-white px-5 text-sm font-black text-fleet-night transition hover:border-fleet-ember hover:text-fleet-ember">Explore the platform</Link>
          </div>
        </div>
      </section>

      <section className="section-wrap pb-8 sm:pb-12">
        <div className="mb-5 max-w-2xl">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-fleet-ember">Available services</p>
          <h2 className="mt-2 text-2xl font-black text-fleet-night sm:text-3xl">What you can do with Fast Fleets 360 in Oyo State</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => {
            const Icon = service.icon;
            return <article key={service.title} className="flex min-h-52 flex-col rounded-[20px] border border-white/80 bg-white/[0.92] p-5 shadow-[0_16px_42px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl">
              <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-fleet-navy text-white"><Icon className="h-4 w-4" /></span>
              <h2 className="mt-4 text-lg font-black text-fleet-night">{service.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{service.body}</p>
              <Link href={service.href} className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-black text-fleet-ember transition hover:text-fleet-night">{service.label} <ArrowRight className="h-4 w-4" /></Link>
            </article>;
          })}
        </div>
      </section>

      <section className="section-wrap">
        <div className="rounded-[24px] bg-fleet-night px-6 py-8 text-white shadow-[0_20px_50px_rgba(8,17,31,0.22)] sm:px-8">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-300">Oyo State service coverage</p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">Choose a service, add your pickup and destination details, and get moving.</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">Availability can depend on the service, participating vendor, route, and rider capacity. The app shows the options available for your order before you continue.</p>
        </div>
      </section>
    </main>
  );
}
