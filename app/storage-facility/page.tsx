import type { Metadata } from "next";
import { StorageFacilityBooking } from "@/components/storage-facility/storage-facility-booking";
import { StorageBookingList } from "@/components/storage-facility/storage-booking-list";
export const metadata: Metadata = { title: "Book Storage Facility | Fast Fleets 360", description: "Book affordable storage for your items with optional Fast Fleets pickup." };
export default function StorageFacilityPage() { return <><StorageFacilityBooking /><StorageBookingList /></>; }
