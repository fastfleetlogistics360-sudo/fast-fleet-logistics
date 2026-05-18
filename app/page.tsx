import type { Metadata } from "next";
import { AppWorkflowCards } from "@/components/landing/app-workflow-cards";
import { LaunchLandingPage } from "@/components/landing/launch-landing-page";

export const metadata: Metadata = {
  title: "Welcome"
};

export default function LandingPage() {
  return (
    <>
      <LaunchLandingPage />
      <AppWorkflowCards />
    </>
  );
}
