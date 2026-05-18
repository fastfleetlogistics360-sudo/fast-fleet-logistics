import type { Metadata } from "next";
import { BusinessRegistrationFlow } from "@/components/onboarding/business-registration-flow";

export const metadata: Metadata = {
  title: "Business Registration"
};

export default function BusinessRegisterPage() {
  return (
    <section className="section-wrap py-8 sm:py-12">
      <BusinessRegistrationFlow />
    </section>
  );
}
