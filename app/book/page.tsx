import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingFlow } from "@/components/booking/booking-flow";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Book Delivery"
};

export default function BookPage() {
  return (
    <section className="section-wrap py-8 sm:py-12">
      <Suspense fallback={<BookingFlowSkeleton />}>
        <BookingFlow />
      </Suspense>
    </section>
  );
}

function BookingFlowSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-fleet border border-fleet-line bg-white p-6 shadow-lift">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="mt-6 h-56 w-full" />
      </div>
      <div className="rounded-fleet border border-fleet-line bg-white p-6 shadow-lift">
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
