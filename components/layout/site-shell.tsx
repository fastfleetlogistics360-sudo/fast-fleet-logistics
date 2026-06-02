"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { dashboardMenuForRole, flattenDashboardMenu } from "@/lib/dashboard-menus";
import type { DashboardMenuItem } from "@/lib/dashboard-menus";
import { parseUserRole, roleHome } from "@/lib/auth/roles";
import type { UserRole } from "@/types/domain";
import { LinkButton } from "@/components/ui/button";
import { InstagramIcon, TikTokIcon, XIcon } from "@/components/icons/social-icons";
import { SmartWalletTopUp } from "@/components/wallet/smart-wallet-top-up";
import { createClient } from "@/lib/supabase/client";

const SupportWidget = dynamic(() => import("@/components/support/support-widget").then((mod) => mod.SupportWidget), { ssr: false });
const CookieConsent = dynamic(() => import("@/components/layout/cookie-consent").then((mod) => mod.CookieConsent), { ssr: false });

const navItems = [
  { href: "/main", label: "Home" },
  { href: "/book", label: "Book" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/restaurants", label: "Food" },
  { href: "/shopping-mall", label: "Mall" },
  { href: "/track", label: "Track" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rider/onboarding", label: "Riders" },
  { href: "/business/register", label: "Business" },
  { href: "/support", label: "Support" }
];

const brandLogo = "/brand/fastfleet-logo-2026-header.png";

const bottomItems: Array<{ href: string; label: string; icon: LucideIcon; activePaths?: string[] }> = [
  { href: "/book", label: "Book", icon: PackageCheck },
  { href: "/track", label: "Track", icon: Route },
  { href: "/main", label: "Home", icon: LayoutDashboard, activePaths: ["/main", "/dashboard"] },
  { href: "/rider/onboarding", label: "Rider", icon: Bike, activePaths: ["/rider/onboarding", "/rider/dashboard"] },
  { href: "/business/register", label: "Biz", icon: Building2, activePaths: ["/business/register", "/business/dashboard"] }
];

const socialItems: Array<{ href: string; label: string; icon: (props: ComponentPropsWithoutRef<"svg">) => ReactElement; hover: string }> = [
  { href: "https://www.instagram.com/fastfleets360", label: "Instagram", icon: InstagramIcon, hover: "hover:bg-[#E4405F]" },
  { href: "https://x.com/fastfleets360", label: "X", icon: XIcon, hover: "hover:bg-black" },
  { href: "https://www.tiktok.com/@fastfleets360", label: "TikTok", icon: TikTokIcon, hover: "hover:bg-black" }
];

const siteChromeRoutes = new Set(["/main", "/how-it-works", "/privacy", "/terms", "/cookies", "/ndpr", "/support", "/offline"]);

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isDashboardEnvironment =
    pathname === "/dashboard" ||
    pathname.startsWith("/customer/dashboard") ||
    pathname.startsWith("/account/orders") ||
    pathname.startsWith("/rider/dashboard") ||
    pathname.startsWith("/business/dashboard");
  const usesGlobalDashboardMenu = false;
  const hasSiteChrome = siteChromeRoutes.has(pathname);
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<UserRole | null>(null);
  const dashboardMenu = usesGlobalDashboardMenu ? dashboardMenuForRole(accountRole) : null;
  const dashboardBottomItems = dashboardMenu ? flattenDashboardMenu(dashboardMenu).filter((item) => item.href !== "__logout").slice(0, 5) : [];
  const dashboardHomeHref = accountRole ? roleHome[accountRole] : "/choose-account-type";

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(async ({ data }) => {
        if (!data.user) {
          setAccountName(null);
          setAccountRole(null);
          return;
        }
        const [{ data: profile }, { data: appUser }] = await Promise.all([
          supabase.from("profiles").select("account_type").eq("user_id", data.user.id).maybeSingle<{ account_type?: string | null }>(),
          supabase.from("users").select("full_name, email").eq("id", data.user.id).maybeSingle<{ full_name?: string | null; email?: string | null }>()
        ]);
        const role = parseUserRole(profile?.account_type);
        setAccountRole(role);
        setAccountName(appUser?.full_name || appUser?.email || data.user.email || data.user.phone || "Account");
        if (isDashboardEnvironment && !role) router.replace("/choose-account-type");
      });
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        setAccountName(session?.user?.user_metadata?.full_name || session?.user?.email || session?.user?.phone || null);
        if (!session?.user) setAccountRole(null);
      });
      return () => listener.subscription.unsubscribe();
    } catch {
      setAccountName(null);
      setAccountRole(null);
    }
  }, [isDashboardEnvironment, router]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
    <div className={cn("min-h-screen text-fleet-ink", hasSiteChrome ? "site-canvas" : "bg-fleet-paper")}>
      {hasSiteChrome ? (
      <header className="sticky top-0 z-50 border-b border-white/10 bg-fleet-night/90 text-white shadow-[0_18px_50px_rgba(8,17,31,0.22)] backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="Fast Fleets 360 home">
            <Image
              src={brandLogo}
              alt="Fast Fleets 360 Logistics"
              width={46}
              height={46}
              className="h-11 w-11 rounded-fleet border border-white/15 object-cover shadow-[0_12px_28px_rgba(0,0,0,0.28)]"
              priority
            />
            <span className="grid leading-none">
              <strong className="text-base font-black text-white sm:text-lg">Fast Fleets 360</strong>
              <span className="text-[0.66rem] font-black uppercase tracking-[0.28em] text-fleet-ember">Logistics</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-fleet px-3 py-2 text-sm font-extrabold text-white/70 transition hover:bg-white/10 hover:text-white",
                  pathname === item.href && "bg-white/15 text-white ring-1 ring-white/10"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <SmartWalletTopUp />
            {accountName ? (
              <>
                <LinkButton href={dashboardHomeHref} variant="secondary" size="md">
                  {accountName.split(" ")[0]}
                </LinkButton>
                <button type="button" className="rounded-fleet px-3 py-2 text-sm font-extrabold text-white/80 transition hover:bg-white/10 hover:text-white" onClick={signOut}>
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
            className="inline-grid h-11 w-11 place-items-center rounded-fleet border border-white/15 bg-white/10 text-white lg:hidden"
            type="button"
            aria-controls="mobile-site-menu"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>
      ) : null}

      {hasSiteChrome && open ? (
        <div className="fixed inset-0 z-[80] bg-fleet-night/20 backdrop-blur-sm lg:hidden" role="presentation" onClick={() => setOpen(false)}>
          <div
            id="mobile-site-menu"
            className="absolute inset-x-3 bottom-4 top-[76px] overflow-y-auto rounded-fleet border border-white/10 bg-fleet-night/95 p-3 text-white shadow-glow backdrop-blur-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-3 rounded-fleet border border-white/10 bg-white/10 p-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-gold">Menu</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-grid h-10 w-10 place-items-center rounded-fleet border border-white/15 bg-white/10 text-white"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            {!dashboardMenu ? (
              <nav className="grid gap-1" aria-label="Mobile primary">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-fleet px-3 py-3 text-sm font-extrabold text-white/75",
                      pathname === item.href && "bg-white/15 text-white"
                    )}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
            {dashboardMenu ? (
              <div className="mt-3 grid gap-3">
                {dashboardMenu.map((section) => (
                  <div key={section.title} className="rounded-fleet border border-white/10 bg-white/10">
                    <div className="border-b border-white/10 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-fleet-gold">{section.title}</div>
                    <div className="grid gap-1 p-1.5">
                      {section.items.map((item) => {
                        return <DashboardMenuLink key={item.href} item={item} pathname={pathname} onNavigate={() => setOpen(false)} onLogout={signOut} />;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SmartWalletTopUp compact className="col-span-2" />
              {accountName ? (
                <button type="button" className="col-span-2 min-h-11 rounded-fleet border border-white/15 bg-white/10 px-4 text-sm font-extrabold text-white" onClick={signOut}>
                  Sign out
                </button>
              ) : (
                <LinkButton href="/auth" variant="secondary" className="w-full" onClick={() => setOpen(false)}>
                  Sign in
                </LinkButton>
              )}
              {!dashboardMenu ? (
                <LinkButton href="/book" className="w-full" onClick={() => setOpen(false)}>
                  Book
                </LinkButton>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {dashboardMenu ? (
        <aside className="fixed bottom-6 left-4 top-24 z-30 hidden w-72 overflow-y-auto rounded-fleet border border-white/10 bg-fleet-night/90 p-3 text-white shadow-glow backdrop-blur-2xl lg:block" aria-label="Dashboard sidebar">
          <div className="mb-3 rounded-fleet border border-white/10 bg-white/10 p-3">
            <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-fleet-gold">Account menu</span>
            <strong className="mt-1 block text-lg font-black capitalize text-white">{accountRole || "Account"}</strong>
          </div>
          <div className="grid gap-3">
            {dashboardMenu.map((section) => (
              <nav key={section.title} className="grid gap-1" aria-label={section.title}>
                {section.items.map((item) => (
                  <DashboardMenuLink key={item.href} item={item} pathname={pathname} onLogout={signOut} />
                ))}
              </nav>
            ))}
          </div>
        </aside>
      ) : null}

      <main className={cn(hasSiteChrome ? "pb-20 lg:pb-0" : "", dashboardMenu && "lg:pl-80")}>{children}</main>

      {hasSiteChrome ? (
      <>
      <footer className="commercial-strip px-4 py-10 text-white sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <Image
                src={brandLogo}
                alt="Fast Fleets 360 Logistics"
                width={42}
                height={42}
                className="h-10 w-10 rounded-fleet object-cover"
              />
              <strong className="text-lg font-black">Fast Fleets 360 Logistics</strong>
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
          <FooterGroup title="Platform" links={[["Privacy", "/privacy"], ["Terms", "/terms"], ["Cookies", "/cookies"], ["NDPR", "/ndpr"], ["PWA ready", "/offline"]]} />
        </div>
      </footer>

      {!open && !isDashboardEnvironment ? <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-fleet border border-white/15 bg-fleet-night/92 p-1 text-white shadow-glow backdrop-blur-2xl lg:hidden" aria-label="Mobile app">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = item.activePaths ? item.activePaths.some((path) => pathname === path) : pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "grid min-h-14 place-items-center rounded-fleet px-1 text-[0.68rem] font-black text-white/60 transition",
                active && "bg-white/15 text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav> : null}

      {!open && isDashboardEnvironment && dashboardBottomItems.length ? (
        <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-fleet border border-white/15 bg-fleet-night/92 p-1 text-white shadow-glow backdrop-blur-2xl lg:hidden" aria-label="Dashboard mobile menu">
          {dashboardBottomItems.map((item) => {
            const Icon = item.icon;
            const active = isMenuItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "grid min-h-14 place-items-center rounded-fleet px-1 text-center text-[0.62rem] font-black text-white/60 transition",
                  active && "bg-white/15 text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="leading-tight">{shortMenuLabel(item.title)}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <div className="fixed right-4 top-24 z-40 hidden rounded-full border border-white/15 bg-fleet-night/90 p-2 shadow-lift backdrop-blur-xl md:block">
        <Bell className="h-4 w-4 text-fleet-ember" />
      </div>
      {!open ? <SupportWidget /> : null}
      </>
      ) : null}
      <CookieConsent />
    </div>
  );
}

function DashboardMenuLink({
  item,
  pathname,
  onNavigate,
  onLogout
}: {
  item: DashboardMenuItem;
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const Icon = item.icon;
  const active = isMenuItemActive(pathname, item.href);
  const className = cn(
    "flex w-full items-center gap-3 rounded-fleet px-3 py-3 text-left transition",
    active ? "bg-white/15 text-white ring-1 ring-white/10" : "text-white/70 hover:bg-white/10 hover:text-white"
  );
  const content = (
    <>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-fleet", active ? "bg-fleet-ember text-white" : "bg-white/10 text-fleet-gold")}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-black">{item.title}</strong>
        <span className={cn("block text-xs font-bold leading-5", active ? "text-white/[0.82]" : "text-white/[0.72]")}>{item.body}</span>
      </span>
      {item.tag ? <span className="rounded-full bg-fleet-gold/20 px-2 py-1 text-[0.65rem] font-black text-fleet-ember">{item.tag}</span> : null}
    </>
  );

  if (item.href === "__logout") {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          onNavigate?.();
          onLogout();
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {content}
    </Link>
  );
}

function isMenuItemActive(pathname: string, href: string) {
  if (href === "__logout" || href.includes("#")) return false;
  return pathname === href;
}

function shortMenuLabel(label: string) {
  if (label === "Rider Dashboard") return "Dashboard";
  if (label === "Business Dashboard") return "Dashboard";
  if (label === "Book Delivery") return "Book";
  if (label === "Track Delivery") return "Track";
  if (label === "Create Delivery") return "Create";
  if (label === "Active Deliveries") return "Active";
  if (label === "Available Jobs") return "Jobs";
  if (label === "Active Delivery") return "Active";
  return label.replace(" / ", "\n");
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
