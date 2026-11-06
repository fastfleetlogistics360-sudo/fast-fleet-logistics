import type { Metadata } from "next";
import { ServiceLocationPage } from "@/components/seo/service-location-page";

export const metadata: Metadata = { title: "Delivery & Logistics Services in Lagos State", description: "Book dispatch, restaurant and shopping delivery, FastErrands, heavy logistics, storage, and business delivery services with Fast Fleets 360 in Lagos State.", keywords: ["Lagos delivery service", "Lagos dispatch rider", "same day delivery Lagos", "Lagos logistics service", "Fast Fleets 360 Lagos"], alternates: { canonical: "/locations/lagos-state" }, openGraph: { title: "Delivery & Logistics Services in Lagos | Fast Fleets 360", description: "Book dispatch, shop local, and manage logistics with Fast Fleets 360 in Lagos State.", url: "/locations/lagos-state", type: "website" } };
export default function LagosStateLocationPage() { return <ServiceLocationPage state="Lagos" />; }
