import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Heavy Logistics Request" };
export const dynamic = "force-dynamic";

export default async function HeavyLogisticsRequestPage({ params }: { params: Promise<{ requestCode: string }> }) {
  const { requestCode } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/auth?returnTo=/heavy-logistics/${encodeURIComponent(requestCode)}`);
  const { data } = await supabase
    .from("heavy_logistics_requests")
    .select("request_code, item_type, quantity, pickup_address, dropoff_address, preferred_pickup_at, status, quoted_price_ngn, created_at")
    .eq("request_code", requestCode)
    .eq("customer_id", user.id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[linear-gradient(180deg,#f8fafc,#eef3f8)] pb-10">
      <BackButton className="section-wrap pb-4 pt-4" />
      <section className="section-wrap pb-10"><Card className="mx-auto max-w-2xl p-5 sm:p-7"><span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Heavy Logistics</span><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-black text-fleet-night">{data.request_code}</h1><span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-black text-fleet-ember">{label(data.status)}</span></div><div className="mt-6 grid gap-3 text-sm"><Row label="Load" value={`${data.item_type} · ${data.quantity}`} /><Row label="Pickup" value={data.pickup_address} /><Row label="Delivery" value={data.dropoff_address} /><Row label="Pickup time" value={data.preferred_pickup_at ? formatDateTime(data.preferred_pickup_at) : ""} />{data.quoted_price_ngn !== null ? <Row label="Quote" value={formatMoney(data.quoted_price_ngn)} /> : null}</div></Card></section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) { return <div className="rounded-fleet bg-fleet-paper px-3 py-3"><span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><strong className="mt-1 block text-fleet-night">{value}</strong></div>; }
function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
