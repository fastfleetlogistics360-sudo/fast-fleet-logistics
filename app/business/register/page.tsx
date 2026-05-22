import { Suspense } from "react";
import type { Metadata } from "next";
import { BusinessRegistrationFlow } from "@/components/onboarding/business-registration-flow";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Business Registration"
};

export default function BusinessRegisterPage() {
  return (
    <section className="section-wrap py-8 sm:py-12">
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
