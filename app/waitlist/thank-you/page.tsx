import type { Metadata } from "next";
import { CheckCircle2, MailCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Waitlist Confirmed"
};

export default async function WaitlistThankYouPage({
  searchParams
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const params = await searchParams;
  const state = params.state ? decodeURIComponent(params.state) : "your state";

  return (
    <section className="section-wrap grid min-h-[70vh] place-items-center py-10">
      <Card className="w-full max-w-2xl p-6 text-center sm:p-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-sky-700">
          <MailCheck className="h-4 w-4" />
          Waitlist confirmed
        </span>
        <h1 className="mt-4 text-3xl font-black leading-tight text-fleet-night sm:text-5xl">Thank you.</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
          We will reach out to you via the email provided during registration when FastFleet launches in {state}.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <LinkButton href="/" variant="secondary">
            Back home
          </LinkButton>
          <LinkButton href="/dashboard">Open dashboard</LinkButton>
        </div>
      </Card>
    </section>
  );
}
