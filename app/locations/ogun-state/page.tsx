import type { Metadata } from "next";
import { ServiceLocationPage } from "@/components/seo/service-location-page";

export const metadata: Metadata = { title: "Delivery & Logistics Services in Ogun State", description: "Book dispatch, restaurant and shopping delivery, FastErrands, heavy logistics, storage, and business delivery services with Fast Fleets 360 in Ogun State.", keywords: ["Ogun delivery service", "Ogun dispatch rider", "same day delivery Ogun", "Ogun logistics service", "Fast Fleets 360 Ogun"], alternates: { canonical: "/locations/ogun-state" }, openGraph: { title: "Delivery & Logistics Services in Ogun | Fast Fleets 360", description: "Book dispatch, shop local, and manage logistics with Fast Fleets 360 in Ogun State.", url: "/locations/ogun-state", type: "website" } };
export default function OgunStateLocationPage() { return <ServiceLocationPage state="Ogun" />; }
