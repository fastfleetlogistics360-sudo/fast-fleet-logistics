import {
  BarChart3,
  Bell,
  Building2,
  Clock,
  CreditCard,
  FileCheck2,
  FileText,
  Headphones,
  Home,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  Settings,
  UserRound,
  UsersRound,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
    title: "Customer tools",
    items: [
      { title: "Overview", body: "Wallet, orders, and active delivery", href: "/dashboard", icon: Home, tag: "Home" },
      { title: "Book delivery", body: "Create a new dispatch request", href: "/book", icon: Plus },
      { title: "Track delivery", body: "Live rider movement and timeline", href: "/track", icon: MapPin, tag: "Live" },
      { title: "Wallet records", body: "Top-ups, refunds, and payments", href: "/dashboard#wallet", icon: Wallet }
    ]
  },
  {
    title: "Account",
    items: [
      { title: "Saved addresses", body: "Home, office, and pickup points", href: "/dashboard#addresses", icon: PackageCheck },
      { title: "Notifications", body: "Delivery and wallet alerts", href: "/dashboard#notifications", icon: Bell },
      { title: "Support", body: "Tickets and delivery help", href: "/support", icon: Headphones }
    ]
  }
];

export const driverDashboardMenu: DashboardMenuSection[] = [
  {
    title: "Active work",
    items: [
      { title: "Overview", body: "Status, today's jobs, earnings snapshot", href: "/rider/dashboard", icon: Home, tag: "Home" },
      { title: "Job requests", body: "Accept or decline incoming deliveries", href: "/rider/dashboard/job-requests", icon: Bell, tag: "Live" },
      { title: "Active delivery", body: "Live map, route, recipient details", href: "/rider/dashboard/active-delivery", icon: MapPin, tag: "Live" },
      { title: "Update status", body: "Picked up to in transit to delivered", href: "/rider/dashboard/update-status", icon: RefreshCw }
    ]
  },
  {
    title: "History & earnings",
    items: [
      { title: "Earnings", body: "Daily, weekly, monthly income", href: "/rider/dashboard/earnings", icon: BarChart3 },
      { title: "Delivery history", body: "Completed jobs and receipts", href: "/rider/dashboard/delivery-history", icon: Clock },
      { title: "Withdrawals", body: "Cash out to your bank account", href: "/rider/dashboard/withdrawals", icon: CreditCard }
    ]
  },
  {
    title: "Profile & settings",
    items: [
      { title: "My profile", body: "Name, vehicle, coverage area", href: "/rider/dashboard/profile", icon: UserRound },
      { title: "KYC status", body: "Verification and document review", href: "/rider/dashboard/kyc-status", icon: FileCheck2, tag: "KYC" },
      { title: "Availability", body: "Go online / go offline toggle", href: "/rider/dashboard/availability", icon: Settings },
      { title: "Support", body: "Report issues, get help", href: "/support", icon: Headphones }
    ]
  }
];

export const businessDashboardMenu: DashboardMenuSection[] = [
  {
    title: "Operations",
    items: [
      { title: "Overview", body: "Active orders, spend, delivery summary", href: "/business/dashboard", icon: Home, tag: "Home" },
      { title: "New dispatch", body: "Book a delivery for the business", href: "/book", icon: Plus },
      { title: "Track orders", body: "Live status for active deliveries", href: "/track", icon: MapPin, tag: "Live" },
      { title: "Order history", body: "Dispatches, recipients, and status", href: "/business/dashboard#orders", icon: Clock }
    ]
  },
  {
    title: "Finance & team",
    items: [
      { title: "Business wallet", body: "Balance, top-up, prefund deliveries", href: "/business/dashboard#wallet", icon: Wallet },
      { title: "Invoices & receipts", body: "Download delivery records", href: "/business/dashboard#documents", icon: FileText },
      { title: "Team access", body: "Staff who can book dispatches", href: "/business/dashboard#team", icon: UsersRound },
      { title: "Business profile", body: "Company name, address, contact", href: "/business/dashboard#profile", icon: Building2 }
    ]
  }
];

export function dashboardMenuForPath(pathname: string) {
  if (pathname.startsWith("/rider/dashboard")) return driverDashboardMenu;
  if (pathname.startsWith("/business/dashboard")) return businessDashboardMenu;
  if (pathname.startsWith("/dashboard")) return customerDashboardMenu;
  return null;
}

export function flattenDashboardMenu(sections: DashboardMenuSection[]) {
  return sections.flatMap((section) => section.items);
}

export function findDriverDashboardItem(slug: string) {
  return flattenDashboardMenu(driverDashboardMenu).find((item) => item.href === `/rider/dashboard/${slug}`);
}
