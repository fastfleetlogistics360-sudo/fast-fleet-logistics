import type { Metadata } from "next";
import { BookOpen, HeartPulse, Laptop, Palette, Shirt, ShoppingBasket, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = {
  title: "Shopping Mall"
};

const categories: Array<{ title: string; icon: LucideIcon; note: string }> = [
  { title: "Electronics", icon: Laptop, note: "Phones, gadgets, accessories" },
  { title: "Fashion", icon: Shirt, note: "Clothing, shoes, bags" },
  { title: "Groceries", icon: ShoppingBasket, note: "Pantry, fresh items, household" },
  { title: "Pharmacy", icon: HeartPulse, note: "Wellness and essentials" },
  { title: "Books", icon: BookOpen, note: "School, business, fiction" },
  { title: "Beauty", icon: Palette, note: "Skincare, fragrance, grooming" }
];

export default function ShoppingMallPage() {
  return (
    <section className="section-wrap py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
        <div>
          <StatusBadge tone="blue">FastFleet Mall</StatusBadge>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">Shop and get it delivered</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            We&apos;re preparing curated store categories for same-day pickup and delivery across Lagos and Ogun.
          </p>
        </div>
        <Card className="bg-fleet-navy p-5 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-fleet bg-white text-fleet-navy">
              <Store className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-black">Partner with us</h2>
              <p className="mt-1 text-sm font-semibold text-white/75">List your store before marketplace launch.</p>
            </div>
          </div>
          <LinkButton href="/business/register" className="mt-5 w-full bg-fleet-gold text-fleet-night hover:bg-fleet-gold">
            Partner with us - list your store
          </LinkButton>
        </Card>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Card key={category.title} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-paper text-fleet-navy">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-fleet-mint px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-fleet-night">Expansion phase</span>
              </div>
              <h2 className="mt-5 text-2xl font-black text-fleet-night">{category.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{category.note}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
