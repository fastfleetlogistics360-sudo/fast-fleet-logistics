"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";
import {
  Bell,
  Bike,
  Building2,
  LayoutDashboard,
  LogIn,
  Menu,
  PackageCheck,
  Route,
  ShieldCheck,
  UserRound,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { LinkButton } from "@/components/ui/button";
import { FacebookIcon, InstagramIcon, LinkedinIcon, XIcon } from "@/components/icons/social-icons";
import { SmartWalletTopUp } from "@/components/wallet/smart-wallet-top-up";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SupportWidget } from "@/components/support/support-widget";

const navItems = [
  { href: "/main", label: "Home" },
  { href: "/book", label: "Book" },
  { href: "/track", label: "Track" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rider/onboarding", label: "Riders" },
  { href: "/business/register", label: "Business" },
  { href: "/admin", label: "Admin" },
  { href: "/support", label: "Support" }
];

const bottomItems: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/book", label: "Book", icon: PackageCheck },
  { href: "/track", label: "Track", icon: Route },
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/rider/dashboard", label: "Rider", icon: Bike },
  { href: "/business/dashboard", label: "Biz", icon: Building2 }
];

const socialItems: Array<{ href: string; label: string; icon: (props: ComponentPropsWithoutRef<"svg">) => ReactElement; hover: string }> = [
  { href: "https://www.instagram.com/fastfleetlogistics", label: "Instagram", icon: InstagramIcon, hover: "hover:bg-[#E4405F]" },
  { href: "https://www.facebook.com/fastfleetlogistics", label: "Facebook", icon: FacebookIcon, hover: "hover:bg-[#1877F2]" },
  { href: "https://www.linkedin.com/company/fastfleet-logistics", label: "LinkedIn", icon: LinkedinIcon, hover: "hover:bg-[#0A66C2]" },
  { href: "https://x.com/fastfleetng", label: "X", icon: XIcon, hover: "hover:bg-black" }
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLaunchLanding = pathname === "/";
  const isAdminEnvironment = pathname.startsWith("/admin");
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) {
          setAccountName(null);
          return;
        }
        const { data: profile } = await supabase.from("users").select("full_name, email").eq("id", data.user.id).maybeSingle();
        setAccountName(profile?.full_name || profile?.email || data.user.email || data.user.phone || "Account");
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setAccountName(session?.user?.user_metadata?.full_name || session?.user?.email || session?.user?.phone || null);
      });
      return () => listener.subscription.unsubscribe();
    } catch {
      setAccountName(null);
    }
  }, []);

  async function signOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Preview mode may not have live Supabase auth available.
    }
    setAccountName(null);
    window.location.assign("/");
  }

  return (
    <div className="min-h-screen bg-fleet-paper text-fleet-ink">
      {isLaunchLanding || isAdminEnvironment ? (
        <div className="fixed right-4 top-4 z-[90]">
          <ThemeToggle />
        </div>
      ) : null}
      {isLaunchLanding || isAdminEnvironment ? null : (
      <header className="sticky top-0 z-50 border-b border-white/60 bg-white/80 shadow-[0_10px_30px_rgba(8,17,31,0.06)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="FastFleet home">
            <Image
              src="/fastfleet-logo.png"
              alt="FastFleet Logistics"
              width={46}
              height={46}
              className="h-11 w-11 rounded-fleet border border-fleet-line object-cover"
              priority
            />
            <span className="grid leading-none">
              <strong className="text-base font-black text-fleet-night sm:text-lg">FastFleet</strong>
              <span className="text-[0.66rem] font-black uppercase tracking-[0.28em] text-fleet-ember">Logistics</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-fleet px-3 py-2 text-sm font-extrabold text-slate-600 transition hover:bg-fleet-paper hover:text-fleet-night",
                  pathname === item.href && "bg-fleet-night text-white hover:bg-fleet-night hover:text-white"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle />
            <SmartWalletTopUp />
            {accountName ? (
              <>
                <LinkButton href="/dashboard" variant="secondary" size="md">
                  {accountName.split(" ")[0]}
                </LinkButton>
                <button type="button" className="rounded-fleet px-3 py-2 text-sm font-extrabold text-fleet-night" onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <LinkButton href="/auth" variant="secondary" size="md">
                <LogIn className="h-4 w-4" />
                Sign in
              </LinkButton>
            )}
            <LinkButton href="/book" size="md">
              Book delivery
            </LinkButton>
          </div>

          <button
            className="inline-grid h-11 w-11 place-items-center rounded-fleet border border-fleet-line bg-white text-fleet-night lg:hidden"
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open ? (
          <div className="fixed inset-x-3 top-[72px] z-50 rounded-fleet border border-fleet-line bg-white p-3 shadow-glow lg:hidden">
            <div className="mb-2 flex items-center justify-between gap-3 rounded-fleet bg-fleet-paper p-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Menu</span>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-grid h-10 w-10 place-items-center rounded-fleet border border-fleet-line bg-white text-fleet-night"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="grid gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-fleet px-3 py-3 text-sm font-extrabold text-slate-700",
                    pathname === item.href && "bg-fleet-paper text-fleet-night"
                  )}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SmartWalletTopUp compact className="col-span-2" />
              {accountName ? (
                <button type="button" className="col-span-2 min-h-11 rounded-fleet border border-fleet-line bg-white/90 px-4 text-sm font-extrabold text-fleet-night" onClick={signOut}>
                  Sign out
                </button>
              ) : (
                <LinkButton href="/auth" variant="secondary" className="w-full" onClick={() => setOpen(false)}>
                  Sign in
                </LinkButton>
              )}
              <LinkButton href="/book" className="w-full" onClick={() => setOpen(false)}>
                Book
              </LinkButton>
            </div>
          </div>
        ) : null}
      </header>
      )}

      <main className={isLaunchLanding || isAdminEnvironment ? "" : "pb-20 lg:pb-0"}>{children}</main>

      {isLaunchLanding || isAdminEnvironment ? null : (
      <>
      <footer className="bg-fleet-night px-4 py-10 text-white sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/fastfleet-logo.png"
                alt="FastFleet Logistics"
                width={42}
                height={42}
                className="h-10 w-10 rounded-fleet object-cover"
              />
              <strong className="text-lg font-black">FastFleet Logistics</strong>
            </div>
            <p className="mt-4 max-w-sm text-sm font-medium text-white/70">
              Premium dispatch operations for Lagos and Ogun, built for fast booking, trusted riders, and scalable fleet control.
            </p>
            <div className="mt-5 flex gap-2">
              {socialItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "inline-grid h-10 w-10 place-items-center rounded-fleet border border-white/10 bg-white/10 text-white/75 transition hover:-translate-y-0.5 hover:border-transparent hover:text-white",
                      item.hover
                    )}
                    aria-label={item.label}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
            </div>
          </div>
          <FooterGroup title="Customers" links={[["Book delivery", "/book"], ["Track package", "/track"], ["Dashboard", "/dashboard"]]} />
          <FooterGroup title="Partners" links={[["Register driver", "/rider/onboarding"], ["Driver dashboard", "/rider/dashboard"], ["Register business", "/business/register"], ["Business dashboard", "/business/dashboard"]]} />
          <FooterGroup title="Platform" links={[["Privacy", "/privacy"], ["Terms", "/terms"], ["Cookies", "/cookies"], ["NDPR", "/ndpr"], ["Admin", "/admin"], ["PWA ready", "/offline"]]} />
        </div>
      </footer>

      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-fleet border border-white/70 bg-white/92 p-1 shadow-glow backdrop-blur-2xl lg:hidden" aria-label="Mobile app">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "grid min-h-14 place-items-center rounded-fleet px-1 text-[0.68rem] font-black text-slate-500 transition",
                active && "bg-fleet-night text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="fixed right-4 top-24 z-40 hidden rounded-full border border-fleet-line bg-white/90 p-2 shadow-lift backdrop-blur-xl md:block">
        <Bell className="h-4 w-4 text-fleet-ember" />
      </div>
      <div className="fixed bottom-24 right-5 z-40 hidden md:block">
        <Link
          href="/admin"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-fleet-night text-white shadow-glow transition hover:-translate-y-0.5"
          aria-label="Open admin controls"
        >
          <ShieldCheck className="h-5 w-5" />
        </Link>
      </div>
      <SupportWidget />
      </>
      )}
    </div>
  );
}

function FooterGroup({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <strong className="text-sm font-black uppercase tracking-[0.16em] text-fleet-gold">{title}</strong>
      <div className="mt-3 grid gap-2">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="text-sm font-semibold text-white/70 transition hover:text-white">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
