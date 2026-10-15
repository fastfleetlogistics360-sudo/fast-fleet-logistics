import { Suspense } from "react";
import { RiderMatchSearch } from "@/components/booking/rider-match-search";
import { Card } from "@/components/ui/card";

export default async function DeliveryMatchPage({ searchParams }: { searchParams: Promise<{ deliveryId?: string; deliveryCode?: string; matchToken?: string }> }) {
  const params = await searchParams;
  const deliveryId = String(params.deliveryId || "");
  const deliveryCode = String(params.deliveryCode || "");
  if (!deliveryId || !deliveryCode) {
    return <section className="section-wrap py-10"><Card className="mx-auto max-w-xl p-6 text-center text-sm font-semibold text-slate-600">This delivery match link is incomplete. Reopen the order from your dashboard.</Card></section>;
  }
  return <Suspense fallback={null}><section className="section-wrap py-10"><RiderMatchSearch deliveryId={deliveryId} deliveryCode={deliveryCode} matchToken={params.matchToken || null} /></section></Suspense>;
}
