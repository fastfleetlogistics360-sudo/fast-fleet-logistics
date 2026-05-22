import { Suspense } from "react";
import type { Metadata } from "next";
import { TrackingConsole } from "@/components/realtime/tracking-console";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Track Delivery"
};

export default function TrackPage() {
  return (
    <Suspense fallback={<TrackingSkeleton />}>
      <TrackingConsole />
    </Suspense>
  );
}

function TrackingSkeleton() {
  return (
    <section className="section-wrap grid gap-6 py-8 lg:grid-cols-[0.95fr_1.05fr] lg:py-12">
      <div className="grid gap-5">
        <Card className="p-4 sm:p-5">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-4 h-12 w-4/5" />
          <Skeleton className="mt-5 h-12 w-full" />
        </Card>
        <Skeleton className="h-96 w-full rounded-fleet" />
      </div>
      <Card className="p-5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-4 h-10 w-48" />
        <div className="mt-6 grid gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </Card>
    </section>
  );
}
