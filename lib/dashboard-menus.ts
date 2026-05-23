import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  Clock,
  CreditCard,
  FileText,
  Headphones,
  History,
  Home,
  IdCard,
  LogOut,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  ShieldCheck,
  Settings,
  Star,
  UserRound,
  UsersRound,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/domain";

export type DashboardMenuItem = {
  title: string;
  body: string;
  href: string;
  icon: LucideIcon;
  tag?: string;
};

export type DashboardMenuSection = {
  title: string;
  items: DashboardMenuItem[];
};

export const customerDashboardMenu: DashboardMenuSection[] = [
  {
    title: "Customer",
    items: [
      { title: "Dashboard", body: "Wallet, orders, and active delivery", href: "/customer/dashboard", icon: Home, tag: "Home" },
      { title: "Book Delivery", body: "Create a new dispatch request", href: "/book", icon: Plus },
      { title: "Track Delivery", body: "Live rider movement and timeline", href: "/track", icon: MapPin, tag: "Live" },
      { title: "My Orders", body: "Active and completed deliveries", href: "/customer/dashboard#orders", icon: PackageCheck },
      { title: "Saved Addresses", body: "Home, office, and pickup points", href: "/customer/dashboard#addresses", icon: MapPin },
      { title: "Wallet", body: "Balance, top-ups, refunds, and payments", href: "/customer/dashboard#wallet", icon: Wallet },
      { title: "Notifications", body: "Delivery and wallet alerts", href: "/dashboard#notifications", icon: Bell },
      { title: "Support", body: "Tickets and delivery help", href: "/support", icon: Headphones },
      { title: "Profile & Security", body: "Profile, password, and account controls", href: "/customer/dashboard#profile", icon: ShieldCheck },
      { title: "Logout", body: "Sign out of this account", href: "__logout", icon: LogOut }
    ]
  }
];

export const riderDashboardMenu: DashboardMenuSection[] = [
  {
    title: "Rider",
    items: [
      { title: "Rider Dashboard", body: "Status, jobs, and earnings snapshot", href: "/rider/dashboard", icon: Home, tag: "Home" },
      { title: "Available Jobs", body: "Accept or decline incoming deliveries", href: "/rider/dashboard/job-requests", icon: Bell, tag: "Live" },
      { title: "Active Delivery", body: "Live map, route, recipient details", href: "/rider/dashboard/active-delivery", icon: MapPin, tag: "Live" },
      { title: "Delivery History", body: "Completed jobs and receipts", href: "/rider/dashboard/delivery-history", icon: Clock },
      { title: "Earnings", body: "Daily, weekly, monthly income", href: "/rider/dashboard/earnings", icon: BarChart3 },
      { title: "Wallet / Payouts", body: "Cash out to your bank account", href: "/rider/dashboard/withdrawals", icon: CreditCard },
      { title: "Documents & KYC", body: "Rider documents and verification", href: "/rider/onboarding", icon: IdCard },
      { title: "Ratings", body: "Rating and delivery performance", href: "/rider/dashboard/ratings", icon: Star },
      { title: "Support", body: "Report issues, get help", href: "/support", icon: Headphones },
      { title: "Profile & Availability", body: "Profile, vehicle, and online status", href: "/rider/dashboard/profile", icon: Settings },
      { title: "Logout", body: "Sign out of this account", href: "__logout", icon: LogOut }
    ]
  }
];

export const businessDashboardMenu: DashboardMenuSection[] = [
  {
    title: "Business",
    items: [
      { title: "Business Dashboard", body: "Active orders, spend, delivery summary", href: "/business/dashboard", icon: Home, tag: "Home" },
      { title: "Create Delivery", body: "Book a delivery for the business", href: "/book", icon: Plus },
      { title: "Bulk Orders", body: "Upload or create many dispatches", href: "/business/dashboard#bulk", icon: FileText },
      { title: "Active Deliveries", body: "Live status for active deliveries", href: "/track", icon: MapPin, tag: "Live" },
      { title: "Order History", body: "Dispatches, recipients, and status", href: "/business/dashboard#orders", icon: History },
      { title: "Branches / Addresses", body: "Pickup branches and saved addresses", href: "/business/dashboard#addresses", icon: Building2 },
      { title: "Staff Accounts", body: "Team members who can dispatch", href: "/business/dashboard#team", icon: UsersRound },
      { title: "Wallet & Invoices", body: "Balance, top-up, invoices, and receipts", href: "/business/dashboard#wallet", icon: Wallet },
      { title: "Customers", body: "Recipients and customer records", href: "/business/dashboard#customers", icon: BriefcaseBusiness },
      { title: "Reports / Analytics", body: "Spend, performance, and delivery trends", href: "/business/dashboard#reports", icon: BarChart3 },
      { title: "Support", body: "Business support and dispatch help", href: "/support", icon: Headphones },
      { title: "Business Profile", body: "Company name, address, contact", href: "/business/dashboard#profile", icon: Building2 },
      { title: "Logout", body: "Sign out of this account", href: "__logout", icon: LogOut }
    ]
  }
];

export const driverDashboardMenu = riderDashboardMenu;

export function dashboardMenuForRole(role: UserRole | null | undefined) {
  if (role === "rider") return riderDashboardMenu;
  if (role === "business") return businessDashboardMenu;
  if (role === "customer") return customerDashboardMenu;
  return null;
}

export function dashboardMenuForPath(pathname: string) {
  if (pathname.startsWith("/rider/dashboard")) return riderDashboardMenu;
  if (pathname.startsWith("/business/dashboard")) return businessDashboardMenu;
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/customer/dashboard")) return customerDashboardMenu;
  return null;
}

export function flattenDashboardMenu(sections: DashboardMenuSection[]) {
  return sections.flatMap((section) => section.items);
}

export function findDriverDashboardItem(slug: string) {
  return flattenDashboardMenu(riderDashboardMenu).find((item) => item.href === `/rider/dashboard/${slug}`);
}
