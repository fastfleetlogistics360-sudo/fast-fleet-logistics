import type { Metadata } from "next";
import { RiderOnboardingFlow } from "@/components/onboarding/rider-onboarding-flow";

export const metadata: Metadata = {
  title: "Rider Onboarding"
};

export default function RiderOnboardingPage() {
  return (
    <section className="section-wrap py-8 sm:py-12">
      <RiderOnboardingFlow />
    </section>
  );
}
