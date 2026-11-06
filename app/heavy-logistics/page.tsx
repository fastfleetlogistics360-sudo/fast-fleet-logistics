import type { Metadata } from "next";
import { BackButton } from "@/components/ui/back-button";
import { HeavyLogisticsFlow } from "@/components/heavy-logistics/heavy-logistics-flow";

export const metadata: Metadata = { title: "Heavy Logistics & Bulk Delivery", description: "Request heavy logistics for furniture, building materials, bulk goods, and other large-item transport with Fast Fleets 360 in Lagos, Ogun, and Oyo.", keywords: ["heavy logistics Nigeria", "furniture delivery Lagos", "building materials transport", "bulk goods delivery", "heavy delivery Ogun", "heavy logistics Oyo"], alternates: { canonical: "/heavy-logistics" }, openGraph: { title: "Heavy Logistics & Bulk Delivery | Fast Fleets 360", description: "Request transport for furniture, building materials, bulk goods, and other large items.", url: "/heavy-logistics", type: "website" } };

export default function HeavyLogisticsPage() {
  const structuredData = { "@context": "https://schema.org", "@type": "Service", name: "Fast Fleets 360 Heavy Logistics", description: "Transport requests for furniture, building materials, bulk goods, and other large items.", url: "https://fastfleet.com.ng/heavy-logistics", provider: { "@id": "https://fastfleet.com.ng/#organization" }, areaServed: ["Lagos", "Ogun", "Oyo", "Nigeria"], serviceType: "Heavy logistics and bulk goods transport" };
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[radial-gradient(circle_at_top_left,rgba(244,126,24,0.08),transparent_28%),linear-gradient(180deg,#f8fafc,#eef3f8)] pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <BackButton className="section-wrap pb-4 pt-4" />
      <section className="section-wrap pb-10 sm:pb-12"><HeavyLogisticsFlow /></section>
    </main>
  );
}
