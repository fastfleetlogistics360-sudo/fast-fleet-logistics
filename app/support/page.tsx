import type { Metadata } from "next";
import { Headphones, Mail, MessageCircle, Phone, TicketCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SupportTicketForm } from "@/components/support/support-ticket-form";

export const metadata: Metadata = {
  title: "Support"
};

const cards: Array<[string, string, LucideIcon]> = [
  ["Order support", "Pickup edits, route issues, rider arrival, cancellation and delivery proof.", TicketCheck],
  ["Rider support", "Application status, document requests, wallet, delivery workflow.", Headphones],
  ["Business dispatch", "Vendor operations, saved addresses, bulk jobs, scheduled routes.", MessageCircle]
];

export default function SupportPage() {
  return (
    <>
      <CinematicPageHero
        eyebrow="Operations support"
        title="Dispatch help that keeps movement visible."
        body="Ticket infrastructure for customers, riders, vendors, business dispatchers, and operations teams."
        image="https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=2200&q=84"
      >
          <div className="flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/track">Track order</LinkButton>
            <LinkButton href="/book" variant="secondary">
              New delivery
            </LinkButton>
          </div>
      </CinematicPageHero>
    <section className="section-wrap -mt-8 pb-10 sm:-mt-10 sm:pb-12">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div className="rounded-fleet border border-white/70 bg-white/80 p-5 shadow-lift backdrop-blur-xl">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Support center</span>
          <h2 className="mt-3 text-2xl font-black leading-tight text-fleet-night sm:text-4xl">Commercial-grade support lanes.</h2>
          <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
            Keep route issues, wallet questions, rider applications, delivery proof, and business dispatch requests in one Fast Fleets 360 support flow.
          </p>
        </div>
        <Card>
          <SupportTicketForm />
        </Card>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map(([title, body, Icon]) => (
          <Card key={title as string} className="p-5">
            <Icon className="h-5 w-5 text-fleet-ember" />
            <h3 className="mt-4 text-lg font-black text-fleet-night">{title as string}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body as string}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Mail className="h-5 w-5 text-fleet-ember" />
          <h3 className="mt-4 text-lg font-black text-fleet-night">Email and notification structure</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Notification records support in-app, push, and email channels for order accepted, rider arrived, delivery completed, withdrawals, rider approvals, and promotions.
          </p>
        </Card>
        <Card className="p-5">
          <Phone className="h-5 w-5 text-fleet-ember" />
          <h3 className="mt-4 text-lg font-black text-fleet-night">Operations escalation</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            Support tickets can be tied to deliveries, users, rider profiles, and admin SLA queues in Supabase.
          </p>
        </Card>
      </div>
    </section>
    </>
  );
}
