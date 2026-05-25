import Image from "next/image";
import type { Metadata } from "next";
import { HeartPulse, Shirt, ShoppingBasket, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = {
  title: "Shopping Mall"
};

type MallStore = {
  name: string;
  area: string;
  image: string;
  items: Array<{ name: string; price: number }>;
};

const mallCategories: Array<{ title: string; icon: LucideIcon; body: string; stores: MallStore[] }> = [
  {
    title: "Grocery",
    icon: ShoppingBasket,
    body: "Fresh food, household supplies, and pantry restocks delivered from local stores.",
    stores: [
      {
        name: "FreshCart Grocers",
        area: "Lekki Phase 1",
        image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "Rice pack 5kg", price: 18500 },
          { name: "Tomato basket", price: 6200 },
          { name: "Cooking oil 3L", price: 9800 }
        ]
      },
      {
        name: "Market Square Pickup",
        area: "Ikeja GRA",
        image: "https://images.unsplash.com/photo-1506617420156-8e4536971650?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "Breakfast bundle", price: 14500 },
          { name: "Fruit crate", price: 7800 },
          { name: "Family stew pack", price: 11200 }
        ]
      },
      {
        name: "Daily Pantry Hub",
        area: "Yaba",
        image: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "Noodles carton", price: 13200 },
          { name: "Beverage pack", price: 10500 },
          { name: "Cleaning essentials", price: 8900 }
        ]
      }
    ]
  },
  {
    title: "Pharmacy",
    icon: HeartPulse,
    body: "Wellness, personal care, and pharmacy essentials prepared for quick rider pickup.",
    stores: [
      {
        name: "CarePlus Pharmacy",
        area: "Victoria Island",
        image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "First aid kit", price: 16500 },
          { name: "Vitamin C pack", price: 7200 },
          { name: "Digital thermometer", price: 11500 }
        ]
      },
      {
        name: "HealthBridge Store",
        area: "Surulere",
        image: "https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "Wellness bundle", price: 13800 },
          { name: "Blood pressure monitor", price: 32500 },
          { name: "Sanitizer pack", price: 5400 }
        ]
      },
      {
        name: "MedRun Essentials",
        area: "Ajah",
        image: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "Baby care pack", price: 18200 },
          { name: "Pain relief pack", price: 6900 },
          { name: "Personal care kit", price: 9700 }
        ]
      }
    ]
  },
  {
    title: "Fashion",
    icon: Shirt,
    body: "Clothing, accessories, and ready-to-send style picks from local fashion vendors.",
    stores: [
      {
        name: "Urban Thread Lagos",
        area: "Lekki",
        image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "Casual shirt", price: 15500 },
          { name: "Denim trousers", price: 28500 },
          { name: "Leather belt", price: 8500 }
        ]
      },
      {
        name: "StyleRack Boutique",
        area: "Ikeja City",
        image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "Ankara dress", price: 32000 },
          { name: "Handbag", price: 24500 },
          { name: "Scarf set", price: 7600 }
        ]
      },
      {
        name: "Sneaker Lane",
        area: "Yaba",
        image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=70",
        items: [
          { name: "Daily sneakers", price: 42000 },
          { name: "Sports socks", price: 5200 },
          { name: "Cap", price: 6800 }
        ]
      }
    ]
  }
];

export default function ShoppingMallPage() {
  return (
    <section className="section-wrap py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
        <div>
          <StatusBadge tone="blue">FastFleet Mall</StatusBadge>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">Shop local stores and get it delivered.</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
            Browse grocery, pharmacy, and fashion vendors with prices ready for same-day pickup and delivery.
          </p>
        </div>
        <Card className="bg-fleet-navy p-5 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-fleet bg-white text-fleet-navy">
              <Store className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl font-black">Vendor onboarding</h2>
              <p className="mt-1 text-sm font-semibold text-white/75">Restaurants, groceries, pharmacies, fashion stores, and malls can register for KYC review.</p>
            </div>
          </div>
          <LinkButton href="/business/register" className="mt-5 w-full bg-fleet-gold text-fleet-night hover:bg-fleet-gold">
            Register your store
          </LinkButton>
        </Card>
      </div>

      <div className="mt-10 grid gap-10">
        {mallCategories.map((category) => {
          const Icon = category.icon;
          return (
            <section key={category.title} className="grid gap-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">
                    <Icon className="h-4 w-4" />
                    {category.title}
                  </span>
                  <h2 className="mt-2 text-3xl font-black text-fleet-night">{category.title} stores</h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">{category.body}</p>
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {category.stores.map((store) => (
                  <Card key={store.name} className="overflow-hidden p-0">
                    <div className="relative h-44">
                      <Image src={store.image} alt={store.name} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
                    </div>
                    <div className="p-4">
                      <h3 className="text-xl font-black text-fleet-night">{store.name}</h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{store.area}</p>
                      <div className="mt-4 grid gap-2">
                        {store.items.map((item) => (
                          <div key={item.name} className="flex items-center justify-between gap-3 rounded-fleet bg-fleet-paper px-3 py-2">
                            <span className="text-sm font-bold text-slate-700">{item.name}</span>
                            <strong className="text-sm font-black text-fleet-night">{formatMoney(item.price)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
