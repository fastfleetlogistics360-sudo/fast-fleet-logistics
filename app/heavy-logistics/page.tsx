import type { Metadata } from "next";
import { BackButton } from "@/components/ui/back-button";
import { HeavyLogisticsFlow } from "@/components/heavy-logistics/heavy-logistics-flow";

export const metadata: Metadata = { title: "Heavy Logistics" };

export default function HeavyLogisticsPage() {
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[radial-gradient(circle_at_top_left,rgba(244,126,24,0.08),transparent_28%),linear-gradient(180deg,#f8fafc,#eef3f8)] pb-10">
      <BackButton className="section-wrap pb-4 pt-4" />
      <section className="section-wrap pb-10 sm:pb-12"><HeavyLogisticsFlow /></section>
    </main>
  );
}
