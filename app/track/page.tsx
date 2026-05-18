import { Suspense } from "react";
import type { Metadata } from "next";
import { TrackingConsole } from "@/components/realtime/tracking-console";

export const metadata: Metadata = {
  title: "Track Delivery"
};

export default function TrackPage() {
  return (
    <Suspense>
      <TrackingConsole />
    </Suspense>
  );
}
