import type { Metadata } from "next";
import { Suspense } from "react";
import { DeliveryDetailsConsole } from "@/components/realtime/delivery-details-console";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Delivery Details"
};

export default function DeliveryDetailsPage() {
  return (
    <Suspense fallback={<DetailsSkeleton />}>
      <DeliveryDetailsConsole />
    </Suspense>
  );
}

function DetailsSkeleton() {
  return (
    <section className="section-wrap grid gap-5 py-8">
      <Skeleton className="h-40" />
      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-56" />
      </div>
    </section>
  );
}
