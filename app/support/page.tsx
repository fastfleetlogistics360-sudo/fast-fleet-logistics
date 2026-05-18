import type { Metadata } from "next";
import { Headphones, Mail, MessageCircle, Phone, TicketCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
    <section className="section-wrap py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Support center</span>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">Dispatch help that keeps moving.</h1>
          <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
            Ticket infrastructure for customers, riders, vendors, business dispatchers, and operations teams.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/track">Track order</LinkButton>
            <LinkButton href="/book" variant="secondary">
              New delivery
            </LinkButton>
          </div>
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
  );
}
