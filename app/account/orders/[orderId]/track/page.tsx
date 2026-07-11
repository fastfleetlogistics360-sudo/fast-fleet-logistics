import type { Metadata } from "next";
import { AccountOrderPage } from "../_components/account-order-page";

export const metadata: Metadata = {
  title: "Track Order"
};

export const dynamic = "force-dynamic";

export default async function TrackOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  return <AccountOrderPage params={params} mode="tracking" />;
}
