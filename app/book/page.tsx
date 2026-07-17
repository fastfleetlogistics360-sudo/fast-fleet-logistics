import type { Metadata } from "next";
import { Suspense } from "react";
import { LockKeyhole, Sparkles } from "lucide-react";
import { BookingFlow } from "@/components/booking/booking-flow";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";
import { BackButton } from "@/components/ui/back-button";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LIVE_STATES, launchStatusLabel, normalizeLaunchStatus, normalizeState, rolloutWaveForState } from "@/lib/launch-states";
import { parseSelfServiceRole, parseUserRole } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Book Delivery"
};

export default async function BookPage() {
  const access = await getCustomerBookingAccess();

  return (
    <>
      <BackButton className="section-wrap pb-4 pt-4" />
      <CinematicPageHero
        eyebrow="Book delivery"
        title="Book a rider with clear pricing."
        body="Add the route, package details, delivery speed, and payment method."
        image="https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=2200&q=84"
      >
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/track" variant="secondary">Track package</LinkButton>
          <LinkButton href="/support" variant="dark">Need support?</LinkButton>
        </div>
      </CinematicPageHero>
      <section className="section-wrap -mt-8 pb-10 sm:-mt-10 sm:pb-12">
        {access.restricted ? (
          <BookingRolloutGate state={access.state} status={access.status} />
        ) : (
          <Suspense fallback={<BookingFlowSkeleton />}>
            <BookingFlow />
          </Suspense>
        )}
      </section>
    </>
  );
}

async function getCustomerBookingAccess() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return { restricted: false, state: "Lagos", status: "active" };

    const [{ data: profile }, { data: appUser }] = await Promise.all([
      supabase.from("profiles").select("account_type,lga").eq("user_id", user.id).maybeSingle<{ account_type?: string | null; lga?: string | null }>(),
      supabase.from("users").select("default_zone").eq("id", user.id).maybeSingle<{ default_zone?: string | null }>()
    ]);
    const role = parseUserRole(profile?.account_type) || parseSelfServiceRole(user.user_metadata?.account_type || user.user_metadata?.role);
    if (role && role !== "customer") return { restricted: false, state: "Lagos", status: "active" };

    const state = normalizeState(profile?.lga || appUser?.default_zone || user.user_metadata?.state || user.user_metadata?.default_zone) || "Lagos";
    const { data: launchRow } = await supabase.from("platform_launch_states").select("status").eq("state", state).maybeSingle<{ status?: string | null }>();
    const status = normalizeLaunchStatus(launchRow?.status || (DEFAULT_LIVE_STATES.includes(state as (typeof DEFAULT_LIVE_STATES)[number]) ? "active" : "waitlist"));
    return { restricted: status !== "active" && status !== "live", state, status };
  } catch {
    return { restricted: false, state: "Lagos", status: "active" };
  }
}

function BookingRolloutGate({ state, status }: { state: string; status: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-fleet-gold/40 bg-fleet-gold/15 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">
            <Sparkles className="h-4 w-4" />
            {launchStatusLabel(status)}
          </span>
          <h2 className="mt-4 text-3xl font-black leading-tight text-fleet-night sm:text-5xl">Fast Fleets 360 is preparing operations in {state}</h2>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
            Your account is ready, but live deliveries open when Fast Fleets 360 activates the {rolloutWaveForState(state, status)} for your area.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/dashboard" variant="secondary">Open early-access dashboard</LinkButton>
            <LinkButton href="/support">Request early access</LinkButton>
          </div>
        </div>
        <div className="grid gap-3">
          {["Booking deliveries", "Requesting riders", "Creating active shipments"].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-fleet border border-fleet-line/80 bg-white/70 p-3 text-sm font-black text-slate-500">
              <LockKeyhole className="h-4 w-4 text-fleet-ember" />
              {item} unlocks at launch
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function BookingFlowSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-fleet border border-fleet-line bg-white p-6 shadow-lift">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="mt-6 h-56 w-full" />
      </div>
      <div className="rounded-fleet border border-fleet-line bg-white p-6 shadow-lift">
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
