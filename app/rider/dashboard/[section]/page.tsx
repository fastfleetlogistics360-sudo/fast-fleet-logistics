import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bike, Clock, CreditCard, FileCheck2, Headphones, MapPin, RefreshCw } from "lucide-react";
import { findDriverDashboardItem } from "@/lib/dashboard-menus";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { RoutePreview } from "@/components/maps/route-preview";

export const metadata: Metadata = {
  title: "Driver Dashboard Tool"
};

export default async function DriverDashboardSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const item = findDriverDashboardItem(section);
  if (!item) notFound();

  const Icon = item.icon;
  const panel = sectionPanel(section);

  return (
    <section className="section-wrap py-8 sm:py-12">
      <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="p-5 sm:p-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">
              <Icon className="h-4 w-4" />
              Driver menu
            </span>
            <h1 className="mt-4 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">{item.title}</h1>
            <p className="mt-3 max-w-xl text-sm font-semibold leading-7 text-slate-600">{item.body}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LinkButton href="/rider/dashboard" variant="secondary">
                Back to dashboard
              </LinkButton>
              <LinkButton href="/support" variant="secondary">
                <Headphones className="h-4 w-4" />
                Support
              </LinkButton>
            </div>
          </div>
          <div className="bg-fleet-night p-4">
            <RoutePreview className="h-full min-h-[320px]" label={item.title} status={section === "active-delivery" ? "in_transit" : "searching"} riderName="Driver route" />
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {panel.map(({ title, value, icon: PanelIcon, tone }) => (
          <Card key={title} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-paper text-fleet-ember">
                <PanelIcon className="h-4 w-4" />
              </span>
              <StatusBadge tone={tone}>{value}</StatusBadge>
            </div>
            <h2 className="mt-4 text-lg font-black text-fleet-night">{title}</h2>
          </Card>
        ))}
      </div>
    </section>
  );
}

function sectionPanel(section: string) {
  if (section === "withdrawals") {
    return [
      { title: "Available payout", value: "Wallet", icon: CreditCard, tone: "green" as const },
      { title: "Admin review", value: "Required", icon: FileCheck2, tone: "amber" as const },
      { title: "Payout window", value: "24h", icon: Clock, tone: "blue" as const }
    ];
  }
  if (section === "kyc-status") {
    return [
      { title: "KYC status", value: "Pending", icon: FileCheck2, tone: "amber" as const },
      { title: "Vehicle review", value: "Admin", icon: Bike, tone: "blue" as const },
      { title: "Support review", value: "Open", icon: Headphones, tone: "green" as const }
    ];
  }
  return [
    { title: "Route state", value: "Live", icon: MapPin, tone: "green" as const },
    { title: "Driver action", value: "Ready", icon: RefreshCw, tone: "blue" as const },
    { title: "Timing", value: "Realtime", icon: Clock, tone: "amber" as const }
  ];
}
