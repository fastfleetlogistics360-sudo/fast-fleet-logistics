"use client";

import Image from "next/image";
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
import { FacebookIcon, InstagramIcon, LinkedinIcon, XIcon } from "@/components/icons/social-icons";
import { SmartWalletTopUp } from "@/components/wallet/smart-wallet-top-up";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SupportWidget } from "@/components/support/support-widget";
import { CookieConsent } from "@/components/layout/cookie-consent";

const navItems = [
  { href: "/main", label: "Home" },
  { href: "/book", label: "Book" },
  { href: "/restaurants", label: "Food" },
  { href: "/shopping-mall", label: "Mall" },
  { href: "/track", label: "Track" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rider/onboarding", label: "Riders" },
  { href: "/business/register", label: "Business" },
  { href: "/support", label: "Support" }
];

const bottomItems: Array<{ href: string; label: string; icon: LucideIcon; activePaths?: string[] }> = [
  { href: "/book", label: "Book", icon: PackageCheck },
  { href: "/track", label: "Track", icon: Route },
  { href: "/main", label: "Home", icon: LayoutDashboard, activePaths: ["/main", "/dashboard"] },
  { href: "/rider/onboarding", label: "Rider", icon: Bike, activePaths: ["/rider/onboarding", "/rider/dashboard"] },
  { href: "/business/register", label: "Biz", icon: Building2, activePaths: ["/business/register", "/business/dashboard"] }
];

const socialItems: Array<{ href: string; label: string; icon: (props: ComponentPropsWithoutRef<"svg">) => ReactElement; hover: string }> = [
  { href: "https://www.instagram.com/fastfleetlogistics", label: "Instagram", icon: InstagramIcon, hover: "hover:bg-[#E4405F]" },
  { href: "https://www.facebook.com/fastfleetlogistics", label: "Facebook", icon: FacebookIcon, hover: "hover:bg-[#1877F2]" },
  { href: "https://www.linkedin.com/company/fastfleet-logistics", label: "LinkedIn", icon: LinkedinIcon, hover: "hover:bg-[#0A66C2]" },
  { href: "https://x.com/fastfleetng", label: "X", icon: XIcon, hover: "hover:bg-black" }
];

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLaunchLanding = pathname === "/";
  const isAdminEnvironment = pathname.startsWith("/admin");
  const isDashboardEnvironment =
    pathname === "/dashboard" ||
    pathname.startsWith("/customer/dashboard") ||
    pathname.startsWith("/account/orders") ||
    pathname.startsWith("/rider/dashboard") ||
    pathname.startsWith("/business/dashboard");
  const hasSiteChrome = !isLaunchLanding && !isAdminEnvironment;
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<UserRole | null>(null);
  const dashboardMenu = isDashboardEnvironment ? dashboardMenuForRole(accountRole) : null;
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
    <div className="min-h-screen bg-fleet-paper text-fleet-ink">
      {isLaunchLanding || isAdminEnvironment ? (
        <div className="fixed right-4 top-4 z-[90]">
          <ThemeToggle />
        </div>
      ) : null}
      {hasSiteChrome ? (
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
                <LinkButton href={dashboardHomeHref} variant="secondary" size="md">
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
            className="absolute inset-x-3 bottom-4 top-[76px] overflow-y-auto rounded-fleet border border-fleet-line bg-white p-3 shadow-glow"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-3 rounded-fleet bg-fleet-paper p-2">
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
            {!dashboardMenu ? (
              <nav className="grid gap-1" aria-label="Mobile primary">
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
              </nav>
            ) : null}
            {dashboardMenu ? (
              <div className="mt-3 grid gap-3">
                {dashboardMenu.map((section) => (
                  <div key={section.title} className="rounded-fleet border border-fleet-line bg-white">
                    <div className="border-b border-fleet-line px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">{section.title}</div>
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
                <button type="button" className="col-span-2 min-h-11 rounded-fleet border border-fleet-line bg-white/90 px-4 text-sm font-extrabold text-fleet-night" onClick={signOut}>
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
        <aside className="fixed bottom-6 left-4 top-24 z-30 hidden w-72 overflow-y-auto rounded-fleet border border-fleet-line bg-white/95 p-3 shadow-lift backdrop-blur-xl lg:block" aria-label="Dashboard sidebar">
          <div className="mb-3 rounded-fleet bg-fleet-paper p-3">
            <span className="text-[0.68rem] font-black uppercase tracking-[0.16em] text-slate-500">Account menu</span>
            <strong className="mt-1 block text-lg font-black capitalize text-fleet-night">{accountRole || "Account"}</strong>
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

      <main className={cn(isLaunchLanding || isAdminEnvironment ? "" : "pb-20 lg:pb-0", dashboardMenu && "lg:pl-80")}>{children}</main>

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
          <FooterGroup title="Platform" links={[["Privacy", "/privacy"], ["Terms", "/terms"], ["Cookies", "/cookies"], ["NDPR", "/ndpr"], ["PWA ready", "/offline"]]} />
        </div>
      </footer>

      {!open && !isDashboardEnvironment ? <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-fleet border border-white/70 bg-white/92 p-1 shadow-glow backdrop-blur-2xl lg:hidden" aria-label="Mobile app">
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const active = item.activePaths ? item.activePaths.some((path) => pathname === path) : pathname === item.href;
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
      </nav> : null}

      {!open && isDashboardEnvironment && dashboardBottomItems.length ? (
        <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-fleet border border-white/70 bg-white/92 p-1 shadow-glow backdrop-blur-2xl lg:hidden" aria-label="Dashboard mobile menu">
          {dashboardBottomItems.map((item) => {
            const Icon = item.icon;
            const active = isMenuItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "grid min-h-14 place-items-center rounded-fleet px-1 text-center text-[0.62rem] font-black text-slate-500 transition",
                  active && "bg-fleet-night text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="leading-tight">{shortMenuLabel(item.title)}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <div className="fixed right-4 top-24 z-40 hidden rounded-full border border-fleet-line bg-white/90 p-2 shadow-lift backdrop-blur-xl md:block">
        <Bell className="h-4 w-4 text-fleet-ember" />
      </div>
      {!open ? <SupportWidget /> : null}
      </>
      )}
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
    active ? "bg-fleet-night text-white" : "text-slate-700 hover:bg-fleet-paper"
  );
  const content = (
    <>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-fleet", active ? "bg-white/10 text-white" : "bg-fleet-paper text-fleet-ember")}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-black">{item.title}</strong>
        <span className={cn("block text-xs font-bold leading-5", active ? "text-white/70" : "text-slate-500")}>{item.body}</span>
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
