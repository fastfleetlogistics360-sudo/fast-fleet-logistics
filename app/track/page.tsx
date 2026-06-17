import { Suspense } from "react";
import type { Metadata } from "next";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";
import { TrackingConsole } from "@/components/realtime/tracking-console";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Track Delivery"
};

export default function TrackPage() {
  return (
    <>
      <BackButton className="section-wrap pb-4 pt-4" />
      <CinematicPageHero
        eyebrow="Live movement"
        title="Track every handoff from route to arrival."
        body="Follow delivery status, ETA, rider heartbeat, and package movement in one cinematic Fast Fleets 360 control view."
        image="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=2200&q=84"
      />
      <div className="-mt-8 sm:-mt-10">
        <Suspense fallback={<TrackingSkeleton />}>
          <TrackingConsole />
        </Suspense>
      </div>
    </>
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
