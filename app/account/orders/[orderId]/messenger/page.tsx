import type { Metadata } from "next";
import { AccountOrderPage } from "../_components/account-order-page";

export const metadata: Metadata = {
  title: "Order Messenger"
};

export const dynamic = "force-dynamic";

export default async function OrderMessengerPage({ params }: { params: Promise<{ orderId: string }> }) {
  return <AccountOrderPage params={params} mode="messenger" />;
}
