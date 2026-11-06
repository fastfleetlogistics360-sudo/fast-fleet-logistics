import { Suspense } from "react";
import type { Metadata } from "next";
import { BusinessRegistrationFlow } from "@/components/onboarding/business-registration-flow";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Business Dispatch & Delivery Registration",
  description: "Register your business with Fast Fleets 360 to manage repeat deliveries, customer orders, business dispatch operations, and delivery tools in Nigeria.",
  keywords: ["business dispatch Nigeria", "business delivery service", "restaurant delivery management", "vendor dispatch software", "logistics for businesses"],
  alternates: { canonical: "/business/register" },
  openGraph: { title: "Business Dispatch Registration | Fast Fleets 360", description: "Delivery tools for businesses that manage repeat orders and dispatch operations.", url: "/business/register", type: "website" }
};

export default function BusinessRegisterPage() {
  return (
    <section className="section-wrap pb-8 pt-4 sm:pb-12 sm:pt-6">
      <BackButton className="mb-4" />
      <Suspense fallback={<BusinessRegistrationSkeleton />}>
        <BusinessRegistrationFlow />
      </Suspense>
    </section>
  );
}

function BusinessRegistrationSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
      <Card className="p-5">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-4 h-12 w-4/5" />
        <Skeleton className="mt-4 h-24 w-full" />
      </Card>
      <Card className="p-4 sm:p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-10 w-4/5" />
        <Skeleton className="mt-6 h-12 w-full" />
        <Skeleton className="mt-3 h-12 w-full" />
      </Card>
    </div>
  );
}
