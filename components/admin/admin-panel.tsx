"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  Bike,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FilePenLine,
  Globe2,
  LockKeyhole,
  LogOut,
  Loader2,
  Map,
  Menu,
  PackageCheck,
  PauseCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ReceiptText,
  Save,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Store as StoreIcon,
  TicketCheck,
  Trash2,
  Utensils,
  UsersRound,
  WalletCards,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { defaultLaunchStateRecords, launchStatusLabel, rememberLiveState } from "@/lib/launch-states";
import type { LaunchStateRecord } from "@/lib/launch-states";
import { formatMoney } from "@/lib/format";
import { riderReviewLabel } from "@/lib/kyc";
import { normalizeRiderAccountType, riderAccountTypeLabel, riderAccountTypes, type RiderAccountType } from "@/lib/rider-account-type";
import {
  defaultRestaurantKitchens,
  normalizeRestaurantKitchens,
  restaurantMenuStorageKey,
  type RestaurantKitchen,
  type RestaurantMenuItem
} from "@/lib/restaurant-menu";
import {
  defaultShoppingMalls,
  mallMenuStorageKey,
  normalizeShoppingMalls,
  type MallProduct,
  type MallStore,
  type ShoppingMall
} from "@/lib/mall-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";

const heatmap: Array<[string, number]> = [
  ["Lekki", 96],
  ["VI", 82],
  ["Ikeja", 78],
  ["Yaba", 64],
  ["Ota", 53],
  ["Abeokuta", 47]
];

const metrics: Array<[string, string, string]> = [
  ["GMV", "NGN 42.8m", "+18% month"],
  ["Active riders", "184", "91 online now"],
  ["Success rate", "98.2%", "2.1% cancellations"],
  ["Open tickets", "23", "7 urgent"]
];

type AdminSectionId =
  | "overview"
  | "rider-approvals"
  | "business-kyc"
  | "delivery-timelines"
  | "withdrawal-review"
  | "company-transaction-logs"
  | "restaurant-menus"
  | "mall-menus"
  | "ops-control"
  | "field-insights"
  | "risk-signals";

const adminSectionIds = new Set<string>([
  "overview",
  "rider-approvals",
  "business-kyc",
  "delivery-timelines",
  "withdrawal-review",
  "company-transaction-logs",
  "restaurant-menus",
  "mall-menus",
  "ops-control",
  "field-insights",
  "risk-signals"
]);

const adminNavGroups: Array<{
  title: string;
  items: Array<{ id: AdminSectionId; label: string; icon: LucideIcon; count?: (stats: AdminNavStats) => string }>;
}> = [
  {
    title: "Command",
    items: [
      { id: "overview", label: "Overview", icon: Globe2 },
      { id: "delivery-timelines", label: "Deliveries", icon: PackageCheck, count: (stats) => String(stats.activeDeliveries) }
    ]
  },
  {
    title: "Approvals",
    items: [
      { id: "rider-approvals", label: "Driver KYC", icon: ClipboardCheck, count: (stats) => String(stats.pendingRiders) },
      { id: "business-kyc", label: "Business KYC", icon: Building2, count: (stats) => String(stats.pendingBusinesses) }
    ]
  },
  {
    title: "Money",
    items: [
      { id: "withdrawal-review", label: "Withdrawals", icon: CircleDollarSign, count: (stats) => String(stats.pendingWithdrawals) },
      { id: "company-transaction-logs", label: "Company books", icon: ReceiptText }
    ]
  },
  {
    title: "Catalog",
    items: [
      { id: "restaurant-menus", label: "Kitchens", icon: Utensils },
      { id: "mall-menus", label: "Mall stores", icon: StoreIcon }
    ]
  },
  {
    title: "Controls",
    items: [
      { id: "ops-control", label: "Launch & pricing", icon: SlidersHorizontal },
      { id: "field-insights", label: "Field insights", icon: Map },
      { id: "risk-signals", label: "Risk & support", icon: AlertTriangle, count: (stats) => String(stats.openRisk + stats.openSupport) }
    ]
  }
];

type AdminNavStats = {
  pendingRiders: number;
  pendingBusinesses: number;
  activeDeliveries: number;
  pendingWithdrawals: number;
  openRisk: number;
  openSupport: number;
};

type AdminWithdrawal = {
  id: string;
  amount_ngn: number;
  bank_name: string;
  account_number: string;
  account_name: string | null;
  status: "pending" | "approved" | "rejected" | "paid";
  rejection_reason: string | null;
  created_at: string;
  rider_profiles?: {
    application_status?: string | null;
    vehicle_type?: string | null;
    operating_zone?: string | null;
    users?: {
      full_name?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
  } | null;
};

type AdminRiderDocument = {
  id: string;
  document_type: string;
  status: "submitted" | "approved" | "rejected" | "more_info_required";
  file_url: string | null;
  storage_path?: string | null;
  rejection_reason: string | null;
};

type AdminRider = {
  id: string;
  application_status: "pending_review" | "submitted" | "under_review" | "approved" | "rejected" | "more_info_required";
  rider_account_type?: RiderAccountType | null;
  vehicle_type: string | null;
  plate_number: string | null;
  vehicle_color: string | null;
  operating_zone: string | null;
  online?: boolean | null;
  created_at: string;
  users?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  rider_documents?: AdminRiderDocument[];
};

type AdminBusiness = {
  id: string;
  user_id: string;
  business_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  business_type?: string | null;
  commission_rate?: number | null;
  dispatch_volume: string | null;
  pickup_address: string | null;
  cac_number?: string | null;
  registration_status: "submitted" | "active" | "paused" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  users?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  business_documents?: AdminBusinessDocument[];
};

type AdminBusinessDocument = {
  id: string;
  document_type: string;
  status: string;
  file_url?: string | null;
  storage_path?: string | null;
  rejection_reason?: string | null;
};

type AdminDelivery = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  price_ngn: number;
  eta_minutes: number;
  created_at: string;
  users?: { full_name?: string | null; phone?: string | null; email?: string | null } | null;
  rider_profiles?: { users?: { full_name?: string | null; phone?: string | null; email?: string | null } | null } | null;
};

type SiteControls = {
  bookings_enabled: boolean;
  rider_onboarding_enabled: boolean;
  wallet_topups_enabled: boolean;
  withdrawals_enabled: boolean;
  support_status: "open" | "priority_only" | "closed";
  launch_headline: string;
  launch_message: string;
  wallet_policy: {
    min_topup_ngn: number;
    min_withdrawal_ngn: number;
    max_withdrawal_ngn: number;
    payout_sla_hours: number;
  };
};

type RiskSignal = {
  id: string;
  signal_type: string;
  risk_score: number;
  details: Record<string, unknown> | null;
  resolved_at: string | null;
  created_at: string;
  users?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
  deliveries?: { delivery_code?: string | null; status?: string | null; price_ngn?: number | null } | null;
};

type SupportTicket = {
  id: string;
  topic: string;
  subject: string | null;
  message: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  support_messages?: SupportMessage[];
};

type SupportMessage = {
  id: string;
  sender_type: "customer" | "admin" | "bot";
  body: string;
  created_at: string;
};

type CompanyTransactionCategory =
  | "vehicle_maintenance"
  | "site_maintenance"
  | "delivery_income"
  | "fuel"
  | "payroll"
  | "rider_payout"
  | "office_expense"
  | "software"
  | "tax"
  | "insurance"
  | "licensing_permits"
  | "rent_utilities"
  | "marketing"
  | "customer_refund"
  | "supplier_payment"
  | "asset_purchase"
  | "other";

type CompanyTransactionDirection = "income" | "expense" | "transfer";
type CompanyTransactionStatus = "pending" | "cleared" | "flagged";

type CompanyTransactionLog = {
  id: string;
  entry_date: string;
  category: CompanyTransactionCategory;
  direction: CompanyTransactionDirection;
  amount_ngn: number;
  title: string;
  counterparty: string | null;
  reference: string | null;
  payment_method: string | null;
  status: CompanyTransactionStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CompanyTransactionForm = {
  id?: string;
  entry_date: string;
  category: CompanyTransactionCategory;
  direction: CompanyTransactionDirection;
  amount_ngn: string;
  title: string;
  counterparty: string;
  reference: string;
  payment_method: string;
  status: CompanyTransactionStatus;
  notes: string;
};

const companyTransactionCategories: Array<{ value: CompanyTransactionCategory; label: string }> = [
  { value: "delivery_income", label: "Delivery income" },
  { value: "vehicle_maintenance", label: "Vehicle maintenance" },
  { value: "site_maintenance", label: "Site maintenance" },
  { value: "fuel", label: "Fuel" },
  { value: "payroll", label: "Payroll" },
  { value: "rider_payout", label: "Rider payout" },
  { value: "office_expense", label: "Office expense" },
  { value: "software", label: "Software" },
  { value: "tax", label: "Tax" },
  { value: "insurance", label: "Insurance" },
  { value: "licensing_permits", label: "Licensing and permits" },
  { value: "rent_utilities", label: "Rent and utilities" },
  { value: "marketing", label: "Marketing" },
  { value: "customer_refund", label: "Customer refund" },
  { value: "supplier_payment", label: "Supplier payment" },
  { value: "asset_purchase", label: "Asset purchase" },
  { value: "other", label: "Other" }
];

const companyLogStorageKey = "fastfleet_company_transaction_logs";

const blankCompanyTransactionForm = (): CompanyTransactionForm => ({
  entry_date: new Date().toISOString().slice(0, 10),
  category: "delivery_income",
  direction: "income",
  amount_ngn: "",
  title: "",
  counterparty: "",
  reference: "",
  payment_method: "",
  status: "pending",
  notes: ""
});

const demoWithdrawals: AdminWithdrawal[] = [
  {
    id: "WR-901",
    amount_ngn: 24000,
    bank_name: "Kuda Bank",
    account_number: "2034567890",
    account_name: "Tunde Adebayo",
    status: "pending",
    rejection_reason: null,
    created_at: new Date().toISOString(),
    rider_profiles: {
      application_status: "approved",
      vehicle_type: "bike",
      operating_zone: "Lagos",
      users: { full_name: "Tunde Adebayo", phone: "+2348012345678", email: "tunde@example.com" }
    }
  }
];

const demoRiders: AdminRider[] = [
  {
    id: "RP-1001",
    application_status: "submitted",
    vehicle_type: "bike",
    plate_number: "LSR-428-QA",
    vehicle_color: "Orange",
    operating_zone: "Lekki / VI",
    online: false,
    created_at: new Date().toISOString(),
    users: { full_name: "Amina Yusuf", phone: "+2348012345678", email: "amina@example.com" },
    rider_documents: [
      { id: "DOC-1", document_type: "nin", status: "submitted", file_url: null, rejection_reason: null },
      { id: "DOC-2", document_type: "license", status: "submitted", file_url: null, rejection_reason: null }
    ]
  }
];

const demoBusinesses: AdminBusiness[] = [
  {
    id: "BP-1001",
    user_id: "USR-BIZ-1001",
    business_name: "Adewale Stores",
    contact_name: "Adewale Johnson",
    phone: "+2348012345678",
    email: "ops@example.com",
    industry: "Retail and ecommerce",
    dispatch_volume: "10 - 30 weekly deliveries",
    pickup_address: "14 Acme Street, Ikeja",
    registration_status: "submitted",
    rejection_reason: null,
    created_at: new Date().toISOString(),
    users: { full_name: "Adewale Johnson", phone: "+2348012345678", email: "ops@example.com" }
  }
];

const demoDeliveries: AdminDelivery[] = [
  {
    id: "DLV-1001",
    delivery_code: "FF-240911-01",
    pickup_address: "Victoria Island, Lagos",
    dropoff_address: "Ikeja GRA, Lagos",
    status: "in_transit",
    price_ngn: 10850,
    eta_minutes: 22,
    created_at: new Date().toISOString(),
    users: { full_name: "Fast Fleets 360 Customer", phone: "+2348000000000", email: "customer@example.com" },
    rider_profiles: { users: { full_name: "Tunde Adebayo", phone: "+2348012204410" } }
  }
];

const defaultSiteControls: SiteControls = {
  bookings_enabled: true,
  rider_onboarding_enabled: true,
  wallet_topups_enabled: true,
  withdrawals_enabled: true,
  support_status: "open",
  launch_headline: "Fast Fleets 360 is live in Lagos and Ogun.",
  launch_message: "Customers and riders in new states can join the waitlist while operations expand.",
  wallet_policy: {
    min_topup_ngn: 500,
    min_withdrawal_ngn: 3000,
    max_withdrawal_ngn: 200000,
    payout_sla_hours: 24
  }
};

const demoRiskSignals: RiskSignal[] = [
  {
    id: "FS-1001",
    signal_type: "payment_mismatch",
    risk_score: 82,
    details: { reason: "Wallet debit did not match delivery amount" },
    resolved_at: null,
    created_at: new Date().toISOString(),
    users: { full_name: "Fast Fleets 360 Customer", email: "customer@example.com", phone: "+2348000000000" },
    deliveries: { delivery_code: "FF-240911-02", status: "pending_payment", price_ngn: 12500 }
  }
];

const demoSupportTickets: SupportTicket[] = [
  {
    id: "ST-1001",
    topic: "refund",
    subject: "Wallet top-up pending",
    message: "Customer says Paystack debited them but wallet has not updated.",
    priority: "urgent",
    status: "open",
    contact_name: "Fast Fleets 360 Customer",
    contact_email: "customer@example.com",
    contact_phone: "+2348000000000",
    created_at: new Date().toISOString(),
    support_messages: [
      {
        id: "STM-1001",
        sender_type: "customer",
        body: "Customer says Paystack debited them but wallet has not updated.",
        created_at: new Date().toISOString()
      }
    ]
  }
];

const demoCompanyTransactionLogs: CompanyTransactionLog[] = [
  {
    id: "CTL-1001",
    entry_date: new Date().toISOString().slice(0, 10),
    category: "delivery_income",
    direction: "income",
    amount_ngn: 486000,
    title: "Same-day delivery collections",
    counterparty: "Fast Fleets 360 customers",
    reference: "DAY-CLOSE",
    payment_method: "Wallet / Paystack",
    status: "cleared",
    notes: "Daily delivery income summary.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "CTL-1002",
    entry_date: new Date().toISOString().slice(0, 10),
    category: "vehicle_maintenance",
    direction: "expense",
    amount_ngn: 73500,
    title: "Brake pads and oil service",
    counterparty: "Fleet garage",
    reference: "MAINT-042",
    payment_method: "Transfer",
    status: "pending",
    notes: "Two bikes serviced before evening shift.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "CTL-1003",
    entry_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    category: "site_maintenance",
    direction: "expense",
    amount_ngn: 42500,
    title: "Landing page and hosting maintenance",
    counterparty: "Web operations",
    reference: "SITE-015",
    payment_method: "Card",
    status: "cleared",
    notes: "Monthly platform maintenance.",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString()
  }
];

export function AdminPanel() {
  const [liveCount, setLiveCount] = useState(284);
  const [launchStates, setLaunchStates] = useState<LaunchStateRecord[]>(defaultLaunchStateRecords());
  const [adminRiders, setAdminRiders] = useState<AdminRider[]>(demoRiders);
  const [adminBusinesses, setAdminBusinesses] = useState<AdminBusiness[]>(demoBusinesses);
  const [adminDeliveries, setAdminDeliveries] = useState<AdminDelivery[]>(demoDeliveries);
  const [adminWithdrawals, setAdminWithdrawals] = useState<AdminWithdrawal[]>(demoWithdrawals);
  const [companyLogs, setCompanyLogs] = useState<CompanyTransactionLog[]>(demoCompanyTransactionLogs);
  const [restaurantMenus, setRestaurantMenus] = useState<RestaurantKitchen[]>(defaultRestaurantKitchens);
  const [mallMenus, setMallMenus] = useState<ShoppingMall[]>(defaultShoppingMalls);
  const [companyLogForm, setCompanyLogForm] = useState<CompanyTransactionForm>(blankCompanyTransactionForm);
  const [companyLogSearch, setCompanyLogSearch] = useState("");
  const [companyLogCategory, setCompanyLogCategory] = useState<"all" | CompanyTransactionCategory>("all");
  const [siteControls, setSiteControls] = useState<SiteControls>(defaultSiteControls);
  const [riskSignals, setRiskSignals] = useState<RiskSignal[]>(demoRiskSignals);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(demoSupportTickets);
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<Record<string, string>>({});
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSectionId>("overview");
  const [pricing, setPricing] = useState({ surge: "1.15", commission: "18", bikeBase: "1800" });
  const liveStates = useMemo(() => launchStates.filter((state) => state.status === "active" || state.status === "live").length, [launchStates]);
  const pendingRiderCount = useMemo(() => adminRiders.filter((rider) => !["approved", "rejected"].includes(rider.application_status)).length, [adminRiders]);
  const pendingBusinessCount = useMemo(() => adminBusinesses.filter((business) => business.registration_status === "submitted").length, [adminBusinesses]);
  const activeDeliveryCount = useMemo(() => adminDeliveries.filter((delivery) => !["delivered", "cancelled"].includes(delivery.status)).length, [adminDeliveries]);
  const pendingWithdrawalCount = useMemo(() => adminWithdrawals.filter((withdrawal) => withdrawal.status === "pending").length, [adminWithdrawals]);
  const openRiskCount = useMemo(() => riskSignals.filter((signal) => !signal.resolved_at).length, [riskSignals]);
  const openSupportCount = useMemo(() => supportTickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length, [supportTickets]);
  const navStats = useMemo<AdminNavStats>(
    () => ({
      pendingRiders: pendingRiderCount,
      pendingBusinesses: pendingBusinessCount,
      activeDeliveries: activeDeliveryCount,
      pendingWithdrawals: pendingWithdrawalCount,
      openRisk: openRiskCount,
      openSupport: openSupportCount
    }),
    [activeDeliveryCount, openRiskCount, openSupportCount, pendingBusinessCount, pendingRiderCount, pendingWithdrawalCount]
  );
  const companyLogSummary = useMemo(() => summarizeCompanyLogs(companyLogs), [companyLogs]);
  const filteredCompanyLogs = useMemo(() => {
    const query = companyLogSearch.trim().toLowerCase();
    return companyLogs.filter((log) => {
      const matchesCategory = companyLogCategory === "all" || log.category === companyLogCategory;
      const searchable = [log.title, log.counterparty, log.reference, log.notes, categoryLabel(log.category)].join(" ").toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [companyLogs, companyLogCategory, companyLogSearch]);

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (adminSectionIds.has(hash)) setActiveAdminSection(hash as AdminSectionId);
  }, []);

  async function loadAdminData() {
    setBusyAction("refresh");
    try {
      const [statesResponse, ridersResponse, businessesResponse, deliveriesResponse, withdrawalsResponse, companyLogsResponse, siteControlsResponse, riskSignalsResponse, restaurantsResponse, mallsResponse] = await Promise.all([
        fetch("/api/admin/states"),
        fetch("/api/admin/riders"),
        fetch("/api/admin/businesses"),
        fetch("/api/admin/deliveries"),
        fetch("/api/admin/withdrawals"),
        fetch("/api/admin/company-transactions"),
        fetch("/api/admin/site-controls"),
        fetch("/api/admin/risk-signals"),
        fetch("/api/admin/restaurants"),
        fetch("/api/admin/malls")
      ]);
      const statesResult = await statesResponse.json().catch(() => ({}));
      const ridersResult = await ridersResponse.json().catch(() => ({}));
      const businessesResult = await businessesResponse.json().catch(() => ({}));
      const deliveriesResult = await deliveriesResponse.json().catch(() => ({}));
      const withdrawalsResult = await withdrawalsResponse.json().catch(() => ({}));
      const companyLogsResult = await companyLogsResponse.json().catch(() => ({}));
      const siteControlsResult = await siteControlsResponse.json().catch(() => ({}));
      const riskSignalsResult = await riskSignalsResponse.json().catch(() => ({}));
      const restaurantsResult = await restaurantsResponse.json().catch(() => ({}));
      const mallsResult = await mallsResponse.json().catch(() => ({}));
      const failedSections = [
        ["states", statesResponse, statesResult],
        ["riders", ridersResponse, ridersResult],
        ["businesses", businessesResponse, businessesResult],
        ["deliveries", deliveriesResponse, deliveriesResult],
        ["withdrawals", withdrawalsResponse, withdrawalsResult],
        ["company logs", companyLogsResponse, companyLogsResult],
        ["site controls", siteControlsResponse, siteControlsResult],
        ["risk/support", riskSignalsResponse, riskSignalsResult],
        ["restaurants", restaurantsResponse, restaurantsResult],
        ["malls", mallsResponse, mallsResult]
      ]
        .filter(([, response]) => !(response as Response).ok)
        .map(([label, , result]) => `${label}: ${String((result as { error?: string }).error || "request failed")}`);

      if (Array.isArray(statesResult.states)) setLaunchStates(statesResult.states);
      if (Array.isArray(ridersResult.riders)) setAdminRiders(ridersResult.riders);
      if (Array.isArray(businessesResult.businesses)) setAdminBusinesses(businessesResult.businesses);
      if (Array.isArray(deliveriesResult.deliveries)) setAdminDeliveries(deliveriesResult.deliveries);
      if (Array.isArray(withdrawalsResult.withdrawals)) {
        setAdminWithdrawals(withdrawalsResult.withdrawals);
      }
      if (Array.isArray(companyLogsResult.logs)) {
        const savedLogs = readDemoCompanyLogs();
        setCompanyLogs(companyLogsResult.demo && savedLogs.length > 0 ? savedLogs : companyLogsResult.logs);
      }
      if (siteControlsResult.controls) setSiteControls(siteControlsResult.controls);
      if (Array.isArray(riskSignalsResult.riskSignals)) setRiskSignals(riskSignalsResult.riskSignals);
      if (Array.isArray(riskSignalsResult.supportTickets)) setSupportTickets(riskSignalsResult.supportTickets);
      if (Array.isArray(restaurantsResult.restaurants)) {
        const savedMenus = readDemoRestaurantMenus();
        setRestaurantMenus(restaurantsResult.demo && savedMenus.length > 0 ? savedMenus : normalizeRestaurantKitchens(restaurantsResult.restaurants));
      }
      if (Array.isArray(mallsResult.malls)) {
        const savedMalls = readDemoMallMenus();
        setMallMenus(mallsResult.demo && savedMalls.length > 0 ? savedMalls : normalizeShoppingMalls(mallsResult.malls));
      }
      if (statesResult.demo || ridersResult.demo || businessesResult.demo || deliveriesResult.demo || withdrawalsResult.demo || companyLogsResult.demo || siteControlsResult.demo || riskSignalsResult.demo || restaurantsResult.demo || mallsResult.demo) {
        setAdminMessage("Admin is using local operational fallback data. Add SUPABASE_SERVICE_ROLE_KEY in Vercel and run the Supabase schema to make launches, rider approvals, business KYC, delivery timelines, withdrawals, site controls, risk signals, company logs, restaurant menus, and mall menus write to Supabase.");
      } else if (failedSections.length > 0) {
        setAdminMessage(`Some admin sections did not load: ${failedSections.join("; ")}`);
      }
    } catch {
      setAdminMessage("Could not reach the admin API. Showing saved operational fallback data for now.");
    } finally {
      setBusyAction(null);
    }
  }

  async function updateLaunchState(state: string, status: LaunchStateRecord["status"]) {
    setBusyAction(`state:${state}:${status}`);
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/states", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, status })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update this state.");
      if (status === "active" || status === "live") rememberLiveState(state);
      setLaunchStates((current) =>
        current.map((item) => (item.state === state ? { ...item, status, launched_at: result.launched_at || item.launched_at } : item))
      );
      setAdminMessage(`${state} is now ${launchStatusLabel(status).toLowerCase()}. Customer dashboards will adapt automatically.`);
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not update this state.");
    } finally {
      setBusyAction(null);
    }
  }

  function openAdminSection(id: string) {
    if (adminSectionIds.has(id)) setActiveAdminSection(id as AdminSectionId);
    setAdminMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }

  async function reviewRider(id: string, status: AdminRider["application_status"], riderAccountType?: RiderAccountType, options?: { tagOnly?: boolean }) {
    const current = adminRiders.find((rider) => rider.id === id);
    const reason =
      !options?.tagOnly && (status === "rejected" || status === "more_info_required")
        ? window.prompt("Reason to show the rider:")?.trim()
        : "";
    if (!options?.tagOnly && (status === "rejected" || status === "more_info_required") && !reason) return;

    const operatingZone =
      status === "approved" && !options?.tagOnly
        ? window.prompt("Confirm or update this rider's operating zone:", current?.operating_zone || "")?.trim()
        : current?.operating_zone || "";

    setBusyAction(options?.tagOnly ? `rider:${id}:tag` : `rider:${id}:${status}`);
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/riders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, reason, operatingZone, riderAccountType: riderAccountType || current?.rider_account_type || "independent" })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update rider review.");
      setAdminRiders((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, application_status: status, operating_zone: operatingZone || item.operating_zone }
            : item
        ).map((item) =>
          item.id === id && status === "approved"
            ? { ...item, rider_account_type: riderAccountType || item.rider_account_type || "independent" }
            : item
        )
      );
      setAdminMessage(
        options?.tagOnly
          ? `${current?.users?.full_name || "Rider"} tag updated to ${riderAccountTypeLabel(riderAccountType)}.`
          : `${current?.users?.full_name || "Rider"} KYC status updated to ${riderReviewLabel(status)}.`
      );
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not update rider review.");
    } finally {
      setBusyAction(null);
    }
  }

  async function reviewBusiness(id: string, status: AdminBusiness["registration_status"]) {
    const current = adminBusinesses.find((business) => business.id === id);
    const reason = status === "rejected" ? window.prompt("Reason to show the business:")?.trim() : "";
    if (status === "rejected" && !reason) return;

    setBusyAction(`business:${id}:${status}`);
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/businesses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, reason })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update business KYC.");
      setAdminBusinesses((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, registration_status: status, rejection_reason: status === "rejected" ? reason || null : null }
            : item
        )
      );
      setAdminMessage(`${current?.business_name || "Business"} KYC status updated to ${businessReviewLabel(status)}.`);
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not update business KYC.");
    } finally {
      setBusyAction(null);
    }
  }

  async function reviewWithdrawal(id: string, status: "approved" | "rejected" | "paid") {
    const current = adminWithdrawals.find((withdrawal) => withdrawal.id === id);
    const reason =
      status === "rejected"
        ? window.prompt("Reason to show the driver in red on their withdrawal status:")?.trim()
        : "";
    if (status === "rejected" && !reason) return;

    setBusyAction(`withdrawal:${id}:${status}`);
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, reason })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not review withdrawal.");
      setAdminWithdrawals((items) =>
        items.map((item) => (item.id === id ? { ...item, status, rejection_reason: status === "rejected" ? reason || null : item.rejection_reason } : item))
      );
      setAdminMessage(
        status === "approved"
          ? `${current?.account_name || "Driver"} withdrawal approved. Payout should be credited within 24 hours.`
          : status === "paid"
            ? `${current?.account_name || "Driver"} withdrawal marked as paid.`
            : `${current?.account_name || "Driver"} withdrawal rejected with a visible driver reason.`
      );
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not review withdrawal.");
    } finally {
      setBusyAction(null);
    }
  }

  async function updateDeliveryTimeline(id: string, status: string) {
    setBusyAction(`delivery:${id}:${status}`);
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/deliveries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update delivery timeline.");
      setAdminDeliveries((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
      setAdminMessage(`Delivery timeline updated to ${status.replaceAll("_", " ")}.`);
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not update delivery timeline.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveSiteControls() {
    setBusyAction("site-controls:save");
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/site-controls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(siteControls)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save site controls.");
      setSiteControls(result.controls || siteControls);
      setAdminMessage("Site controls saved. Platform switches and policy settings are ready for your live app to read.");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not save site controls.");
    } finally {
      setBusyAction(null);
    }
  }

  async function resolveRiskSignal(id: string) {
    setBusyAction(`risk:${id}`);
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/risk-signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "risk", id, resolved: true })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not resolve risk signal.");
      setRiskSignals((items) => items.map((item) => (item.id === id ? { ...item, resolved_at: result.item?.resolved_at || new Date().toISOString() } : item)));
      setAdminMessage("Risk signal marked resolved.");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not resolve risk signal.");
    } finally {
      setBusyAction(null);
    }
  }

  async function updateSupportTicket(id: string, status: SupportTicket["status"]) {
    setBusyAction(`support:${id}:${status}`);
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/risk-signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "support", id, status })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update support ticket.");
      setSupportTickets((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
      setAdminMessage("Support ticket status updated.");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not update support ticket.");
    } finally {
      setBusyAction(null);
    }
  }

  async function sendSupportReply(id: string) {
    const body = supportReplyDrafts[id]?.trim();
    if (!body) {
      setAdminMessage("Write a support reply before sending.");
      return;
    }
    setBusyAction(`support:${id}:reply`);
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/risk-signals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "support_message", id, body })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send support reply.");
      const reply: SupportMessage = result.message || {
        id: `local-${Date.now()}`,
        sender_type: "admin",
        body,
        created_at: new Date().toISOString()
      };
      setSupportTickets((items) =>
        items.map((item) =>
          item.id === id
            ? { ...item, status: "in_progress", support_messages: [...(item.support_messages || []), reply] }
            : item
        )
      );
      setSupportReplyDrafts((drafts) => ({ ...drafts, [id]: "" }));
      setAdminMessage("Support reply sent. The ticket is now in progress.");
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : "Could not send support reply.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveCompanyLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(companyLogForm.amount_ngn);
    if (!companyLogForm.title.trim() || !Number.isFinite(amount) || amount < 0) {
      setAdminMessage("Add a clear transaction title and a valid amount.");
      return;
    }

    const payload = {
      id: companyLogForm.id,
      entry_date: companyLogForm.entry_date,
      category: companyLogForm.category,
      direction: companyLogForm.direction,
      amount_ngn: amount,
      title: companyLogForm.title.trim(),
      counterparty: companyLogForm.counterparty.trim(),
      reference: companyLogForm.reference.trim(),
      payment_method: companyLogForm.payment_method.trim(),
      status: companyLogForm.status,
      notes: companyLogForm.notes.trim()
    };

    const editing = Boolean(companyLogForm.id);
    setBusyAction("company-log:save");
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/company-transactions", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save company transaction log.");
      applyCompanyLog(result.log);
      setCompanyLogForm(blankCompanyTransactionForm());
      setAdminMessage(editing ? "Company transaction log updated." : "Company transaction log added.");
    } catch (error) {
      const canUseLocalFallback = error instanceof TypeError || (error instanceof Error && error.message.includes("SUPABASE_SERVICE_ROLE_KEY"));
      if (!canUseLocalFallback) {
        setAdminMessage(error instanceof Error ? error.message : "Could not save company transaction log.");
        return;
      }
      const fallback = toLocalCompanyLog(payload, companyLogForm.id);
      applyCompanyLog(fallback, true);
      setCompanyLogForm(blankCompanyTransactionForm());
      setAdminMessage("Saved in this browser using operational fallback storage. Add SUPABASE_SERVICE_ROLE_KEY and run the schema to save company logs permanently.");
    } finally {
      setBusyAction(null);
    }
  }

  function applyCompanyLog(log: CompanyTransactionLog, persistLocal = false) {
    setCompanyLogs((current) => {
      const next = upsertCompanyLog(current, log);
      if (persistLocal) writeDemoCompanyLogs(next);
      return next;
    });
  }

  function editCompanyLog(log: CompanyTransactionLog) {
    setCompanyLogForm({
      id: log.id,
      entry_date: log.entry_date,
      category: log.category,
      direction: log.direction,
      amount_ngn: String(log.amount_ngn),
      title: log.title,
      counterparty: log.counterparty || "",
      reference: log.reference || "",
      payment_method: log.payment_method || "",
      status: log.status,
      notes: log.notes || ""
    });
    window.location.hash = "company-transaction-logs";
  }

  function updateKitchen(kitchenId: string, patch: Partial<RestaurantKitchen>) {
    setRestaurantMenus((menus) => menus.map((kitchen) => (kitchen.id === kitchenId ? { ...kitchen, ...patch } : kitchen)));
  }

  function updateKitchenItem(kitchenId: string, itemId: string, patch: Partial<RestaurantMenuItem>) {
    setRestaurantMenus((menus) =>
      menus.map((kitchen) =>
        kitchen.id === kitchenId
          ? {
              ...kitchen,
              items: kitchen.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
            }
          : kitchen
      )
    );
  }

  function addKitchenItem(kitchenId: string) {
    setRestaurantMenus((menus) =>
      menus.map((kitchen) =>
        kitchen.id === kitchenId
          ? {
              ...kitchen,
              items: [
                ...kitchen.items,
                {
                  id: `item-${Date.now()}`,
                  name: "New food item",
                  type: "Meal",
                  price: 0,
                  portion: "1 portion",
                  imageUrl: kitchen.items[0]?.imageUrl || defaultRestaurantKitchens[0].items[0].imageUrl
                }
              ]
            }
          : kitchen
      )
    );
  }

  function removeKitchenItem(kitchenId: string, itemId: string) {
    setRestaurantMenus((menus) =>
      menus.map((kitchen) =>
        kitchen.id === kitchenId && kitchen.items.length > 1
          ? { ...kitchen, items: kitchen.items.filter((item) => item.id !== itemId) }
          : kitchen
      )
    );
  }

  function updateMall(mallId: string, patch: Partial<ShoppingMall>) {
    setMallMenus((malls) => malls.map((mall) => (mall.id === mallId ? { ...mall, ...patch } : mall)));
  }

  function updateMallStore(mallId: string, storeId: string, patch: Partial<MallStore>) {
    setMallMenus((malls) =>
      malls.map((mall) =>
        mall.id === mallId
          ? { ...mall, stores: mall.stores.map((store) => (store.id === storeId ? { ...store, ...patch } : store)) }
          : mall
      )
    );
  }

  function updateMallProduct(mallId: string, storeId: string, productId: string, patch: Partial<MallProduct>) {
    setMallMenus((malls) =>
      malls.map((mall) =>
        mall.id === mallId
          ? {
              ...mall,
              stores: mall.stores.map((store) =>
                store.id === storeId
                  ? { ...store, products: store.products.map((product) => (product.id === productId ? { ...product, ...patch } : product)) }
                  : store
              )
            }
          : mall
      )
    );
  }

  async function saveMallMenus() {
    const malls = normalizeShoppingMalls(mallMenus);
    setBusyAction("malls:save");
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/malls", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ malls })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save shopping mall menus.");
      const saved = normalizeShoppingMalls(result.malls);
      setMallMenus(saved);
      writeDemoMallMenus(saved);
      setAdminMessage("Shopping mall vendor products saved. The mall page will load the updated stores and prices.");
    } catch (error) {
      const canUseLocalFallback = error instanceof TypeError || (error instanceof Error && error.message.includes("SUPABASE_SERVICE_ROLE_KEY"));
      if (!canUseLocalFallback) {
        setAdminMessage(error instanceof Error ? error.message : "Could not save shopping mall menus.");
        return;
      }
      setMallMenus(malls);
      writeDemoMallMenus(malls);
      setAdminMessage("Saved mall menus in this browser using operational fallback storage. Add SUPABASE_SERVICE_ROLE_KEY in Vercel for live site-wide mall updates.");
    } finally {
      setBusyAction(null);
    }
  }

  async function saveRestaurantMenus() {
    const restaurants = normalizeRestaurantKitchens(restaurantMenus);
    setBusyAction("restaurants:save");
    setAdminMessage(null);
    try {
      const response = await fetch("/api/admin/restaurants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurants })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save restaurant menus.");
      const saved = normalizeRestaurantKitchens(result.restaurants);
      setRestaurantMenus(saved);
      writeDemoRestaurantMenus(saved);
      setAdminMessage("Restaurant kitchen menus saved. The restaurant page will load the updated meals and prices.");
    } catch (error) {
      const canUseLocalFallback = error instanceof TypeError || (error instanceof Error && error.message.includes("SUPABASE_SERVICE_ROLE_KEY"));
      if (!canUseLocalFallback) {
        setAdminMessage(error instanceof Error ? error.message : "Could not save restaurant menus.");
        return;
      }
      setRestaurantMenus(restaurants);
      writeDemoRestaurantMenus(restaurants);
      setAdminMessage("Saved restaurant menus in this browser using operational fallback storage. Add SUPABASE_SERVICE_ROLE_KEY in Vercel for live site-wide menu updates.");
    } finally {
      setBusyAction(null);
    }
  }

  function exportCompanyLogs() {
    const headers = ["Date", "Category", "Direction", "Amount NGN", "Title", "Counterparty", "Reference", "Payment method", "Status", "Notes"];
    const rows = filteredCompanyLogs.map((log) => [
      log.entry_date,
      categoryLabel(log.category),
      log.direction,
      String(log.amount_ngn),
      log.title,
      log.counterparty || "",
      log.reference || "",
      log.payment_method || "",
      log.status,
      log.notes || ""
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fastfleet-company-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLiveCount((value) => value + 1);
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section id="overview" className="section-wrap scroll-mt-24 py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
        <div>
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" variant="secondary" onClick={() => setAdminMenuOpen(true)} aria-label="Open admin menu">
              <Menu className="h-4 w-4" />
              Menu
            </Button>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Admin panel</span>
          </div>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">Operate Fast Fleets 360 with confidence.</h1>
          <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">
            Monitor riders, deliveries, payouts, pricing, support, fraud signals, zones, and growth metrics from one premium command center.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={loadAdminData} disabled={busyAction === "refresh"}>
              <RefreshCw className={`h-4 w-4 ${busyAction === "refresh" ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" variant="dark" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Live states" value={String(liveStates)} helper="Open dashboard access" />
          <StatTile label="Active deliveries" value={String(activeDeliveryCount)} helper="Timeline control" />
          <StatTile label="Pending withdrawals" value={String(pendingWithdrawalCount)} helper="Need admin review" />
          {metrics.map(([label, value, helper]) => (
            <StatTile key={label} label={label} value={value} helper={helper} />
          ))}
        </div>
      </div>

      {adminMessage ? <div className="mt-5 rounded-fleet bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">{adminMessage}</div> : null}

      <AdminCommandMenu
        active={activeAdminSection}
        open={adminMenuOpen}
        stats={navStats}
        onOpen={() => setAdminMenuOpen(true)}
        onClose={() => setAdminMenuOpen(false)}
        onNavigate={openAdminSection}
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard
          icon={ClipboardCheck}
          title="Rider approvals"
          body="Review KYC, vehicles, operating zones, and approval status."
          count={`${pendingRiderCount} pending`}
          onClick={() => openAdminSection("rider-approvals")}
        />
        <ActionCard
          icon={Building2}
          title="Business KYC"
          body="Approve or reject business dispatch accounts with visible reasons."
          count={`${pendingBusinessCount} pending`}
          onClick={() => openAdminSection("business-kyc")}
        />
        <ActionCard
          icon={PackageCheck}
          title="Delivery timelines"
          body="Update each customer timeline and push realtime green status updates."
          count={`${activeDeliveryCount} active`}
          onClick={() => openAdminSection("delivery-timelines")}
        />
        <ActionCard
          icon={CircleDollarSign}
          title="Withdrawal review"
          body="Approve, reject with reason, or mark rider payouts as credited."
          count={`${pendingWithdrawalCount} pending`}
          onClick={() => openAdminSection("withdrawal-review")}
        />
        <ActionCard
          icon={FilePenLine}
          title="Site controls"
          body="Manage platform switches, launch content, wallet policy, and support flow."
          count={siteControls.support_status.replace("_", " ")}
          onClick={() => openAdminSection("site-controls")}
        />
        <ActionCard
          icon={Utensils}
          title="Kitchen menus"
          body="Edit restaurant prices, portions, photos, and add new food items."
          count={`${restaurantMenus.reduce((count, kitchen) => count + kitchen.items.length, 0)} meals`}
          onClick={() => openAdminSection("restaurant-menus")}
        />
        <ActionCard
          icon={StoreIcon}
          title="Mall vendor menus"
          body="Edit malls, vendor stores, product prices, availability, and Ask Price items."
          count={`${mallMenus.reduce((count, mall) => count + mall.stores.reduce((sum, store) => sum + store.products.length, 0), 0)} products`}
          onClick={() => openAdminSection("mall-menus")}
        />
        <ActionCard
          icon={AlertTriangle}
          title="Risk signals"
          body="Track fraud, payment mismatches, and operational exceptions."
          count={`${openRiskCount + openSupportCount} open`}
          onClick={() => openAdminSection("risk-signals")}
        />
      </div>

      <DeliveryTimelineSection
        deliveries={adminDeliveries}
        busyAction={busyAction}
        onUpdate={updateDeliveryTimeline}
      />

      <CompanyTransactionSection
        form={companyLogForm}
        logs={filteredCompanyLogs}
        summary={companyLogSummary}
        search={companyLogSearch}
        category={companyLogCategory}
        busyAction={busyAction}
        onFormChange={(patch) => setCompanyLogForm((current) => ({ ...current, ...patch }))}
        onSubmit={saveCompanyLog}
        onReset={() => setCompanyLogForm(blankCompanyTransactionForm())}
        onSearchChange={setCompanyLogSearch}
        onCategoryChange={setCompanyLogCategory}
        onEdit={editCompanyLog}
        onExport={exportCompanyLogs}
      />

      <RestaurantMenuSection
        restaurants={restaurantMenus}
        busyAction={busyAction}
        onKitchenChange={updateKitchen}
        onItemChange={updateKitchenItem}
        onAddItem={addKitchenItem}
        onRemoveItem={removeKitchenItem}
        onSave={saveRestaurantMenus}
      />

      <MallMenuSection
        malls={mallMenus}
        busyAction={busyAction}
        onMallChange={updateMall}
        onStoreChange={updateMallStore}
        onProductChange={updateMallProduct}
        onSave={saveMallMenus}
      />

      <div id="ops-control" className="mt-6 grid scroll-mt-24 gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Launch authority</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">State availability</h2>
            </div>
            <Globe2 className="h-5 w-5 text-fleet-ember" />
          </div>
          <div className="mt-5 grid max-h-[420px] gap-3 overflow-auto pr-1">
            {launchStates.map(({ state, status, waitlist_count }) => (
              <div key={state} className="flex items-center justify-between gap-4 rounded-fleet border border-fleet-line bg-white p-3 text-left">
                <span>
                  <strong className="block text-sm font-black text-fleet-night">{state}</strong>
                  <span className="text-xs font-bold text-slate-500">{waitlist_count || 0} waiting</span>
                </span>
                <div className="flex flex-wrap justify-end gap-2">
                  <StatusBadge tone={status === "active" || status === "live" ? "green" : status === "beta" ? "blue" : status === "paused" ? "red" : "amber"}>
                    {launchStatusLabel(status)}
                  </StatusBadge>
                  {(["active", "beta", "waitlist", "paused"] as const).map((nextStatus) => (
                    <Button key={nextStatus} type="button" size="sm" variant={nextStatus === "active" ? "primary" : "secondary"} onClick={() => updateLaunchState(state, nextStatus)} disabled={busyAction === `state:${state}:${nextStatus}` || status === nextStatus}>
                      {nextStatus === "active" ? <Power className="h-4 w-4" /> : null}
                      {nextStatus}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Pricing authority</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Fare controls</h2>
            </div>
            <SlidersHorizontal className="h-5 w-5 text-fleet-ember" />
          </div>
          <div className="mt-5 grid gap-3">
            <AdminInput label="Bike base fare" value={pricing.bikeBase} onChange={(value) => setPricing((current) => ({ ...current, bikeBase: value }))} />
            <AdminInput label="Surge multiplier" value={pricing.surge} onChange={(value) => setPricing((current) => ({ ...current, surge: value }))} />
            <AdminInput label="Commission percent" value={pricing.commission} onChange={(value) => setPricing((current) => ({ ...current, commission: value }))} />
          </div>
          <Button type="button" className="mt-4 w-full">
            Save pricing draft
          </Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Admin access</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Login and URL</h2>
            </div>
            <LockKeyhole className="h-5 w-5 text-fleet-ember" />
          </div>
          <div className="mt-5 grid gap-3 text-sm font-bold text-slate-600">
            <div className="rounded-fleet bg-fleet-paper p-3">
              Admin route: <span className="text-fleet-night">/admin</span>
            </div>
            <div className="rounded-fleet bg-fleet-paper p-3">
              Username: <span className="text-fleet-night">Configured in environment</span>
            </div>
            <div className="rounded-fleet bg-emerald-50 p-3 text-emerald-800">
              Admin login is separate from customer and driver registration.
            </div>
          </div>
        </Card>
      </div>

      <div id="field-insights" className="mt-8 grid scroll-mt-24 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Live deliveries</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">{liveCount} active routes</h2>
            </div>
            <StatusBadge tone="green">Realtime</StatusBadge>
          </div>
          <div className="mt-6 grid h-72 items-end gap-3 rounded-fleet border border-fleet-line bg-fleet-paper p-4 sm:grid-cols-7">
            {[42, 58, 64, 91, 78, 104, 86].map((value, index) => (
              <div key={index} className="flex h-full flex-col justify-end gap-2">
                <div
                  className="rounded-t-fleet bg-gradient-to-t from-fleet-ember to-fleet-leaf"
                  style={{ height: `${Math.min(100, value)}%` }}
                />
                <span className="text-center text-xs font-black text-slate-500">D{index + 1}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Zone heatmap</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Demand by area</h2>
            </div>
            <Map className="h-5 w-5 text-fleet-ember" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {heatmap.map(([zone, value]) => (
              <div key={zone as string} className="rounded-fleet border border-fleet-line bg-white p-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-black text-fleet-night">{zone as string}</strong>
                  <span className="text-xs font-black text-fleet-ember">{value as number}%</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-fleet-paper">
                  <div className="h-2 rounded-full bg-fleet-ember" style={{ width: `${value as number}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <RiderApprovalSection
          riders={adminRiders}
          busyAction={busyAction}
          onReview={reviewRider}
        />
        <BusinessKycSection
          businesses={adminBusinesses}
          busyAction={busyAction}
          onReview={reviewBusiness}
        />
        <DriverWithdrawalSection
          withdrawals={adminWithdrawals}
          busyAction={busyAction}
          onReview={reviewWithdrawal}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {([
          ["Customer management", "Profiles, wallet balances, order history, support context.", UsersRound],
          ["Pricing controls", "Vehicle base fares, per-km fees, surge, commission rates.", SlidersHorizontal],
          ["Fraud detection", "Velocity checks, payment mismatch, location anomalies.", ShieldAlert],
          ["Rider controls", "Suspend, reinstate, zone lock, document re-check.", PauseCircle]
        ] as Array<[string, string, LucideIcon]>).map(([title, body, Icon]) => (
          <Card key={title as string} className="p-5">
            <Icon className="h-5 w-5 text-fleet-ember" />
            <h3 className="mt-4 text-lg font-black text-fleet-night">{title as string}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body as string}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SiteControlsSection
          controls={siteControls}
          busyAction={busyAction}
          onChange={(patch) => setSiteControls((current) => ({ ...current, ...patch }))}
          onWalletPolicyChange={(patch) => setSiteControls((current) => ({ ...current, wallet_policy: { ...current.wallet_policy, ...patch } }))}
          onSave={saveSiteControls}
        />

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Financial control</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Wallet and Paystack oversight</h2>
            </div>
            <WalletCards className="h-5 w-5 text-fleet-ember" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              ["Pending wallet credits", "12", "Verify Paystack references before support escalation"],
              ["Refund queue", formatMoney(186400), "Reverse or approve customer balance refunds"],
              ["Rider withdrawals", "27", "Bank payout approvals and hold controls"],
              ["Platform commission", formatMoney(782000), "Daily commission capture estimate"]
            ].map(([label, value, helper]) => (
              <div key={label as string} className="rounded-fleet border border-fleet-line bg-fleet-paper p-4">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label as string}</span>
                <strong className="mt-2 block text-2xl font-black text-fleet-night">{value as string}</strong>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{helper as string}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <OpsPanel icon={Bike} title="Active rider monitoring" value="91 online" helper="Acceptance, radius, location heartbeat, vehicle compatibility." />
        <OpsPanel icon={TicketCheck} title="Support tickets" value={`${openSupportCount} open`} helper="Delivery edits, refund checks, business account requests." />
        <OpsPanel icon={AlertTriangle} title="Risk signals" value={`${openRiskCount} flags`} helper="Fraud, payment mismatch, and location exception queue." />
      </div>

      <RiskSignalsSection
        riskSignals={riskSignals}
        supportTickets={supportTickets}
        busyAction={busyAction}
        onResolveRisk={resolveRiskSignal}
        onUpdateSupport={updateSupportTicket}
        replyDrafts={supportReplyDrafts}
        onReplyDraftChange={(id, value) => setSupportReplyDrafts((drafts) => ({ ...drafts, [id]: value }))}
        onSendSupportReply={sendSupportReply}
      />
    </section>
  );
}

function AdminCommandMenu({
  active,
  open,
  stats,
  onOpen,
  onClose,
  onNavigate
}: {
  active: AdminSectionId;
  open: boolean;
  stats: AdminNavStats;
  onOpen: () => void;
  onClose: () => void;
  onNavigate: (id: AdminSectionId) => void;
}) {
  return (
    <>
      <div className="sticky top-3 z-30 mt-6 rounded-fleet border border-fleet-line bg-white/95 p-2 shadow-lift backdrop-blur">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="dark" onClick={onOpen} aria-label="Open admin menu">
            <Menu className="h-4 w-4" />
          </Button>
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            {adminNavGroups.flatMap((group) => group.items).map((item) => {
              const Icon = item.icon;
              const selected = active === item.id;
              const count = item.count?.(stats);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-fleet px-3 py-2 text-sm font-black transition ${
                    selected ? "bg-fleet-navy text-white" : "bg-fleet-paper text-slate-600 hover:bg-white hover:text-fleet-night"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {count ? <span className={selected ? "text-white/75" : "text-fleet-ember"}>{count}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-fleet-night/45 backdrop-blur-sm" onClick={onClose}>
          <aside
            className="h-full w-full max-w-sm overflow-y-auto bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-fleet-line pb-4">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Admin menu</span>
                <h2 className="mt-1 text-2xl font-black text-fleet-night">Workspace</h2>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={onClose} aria-label="Close admin menu">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 grid gap-5">
              {adminNavGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{group.title}</h3>
                  <div className="mt-2 grid gap-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const selected = active === item.id;
                      const count = item.count?.(stats);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onNavigate(item.id)}
                          className={`flex items-center justify-between rounded-fleet px-3 py-3 text-left text-sm font-black transition ${
                            selected ? "bg-fleet-navy text-white" : "bg-fleet-paper text-fleet-night hover:bg-white"
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </span>
                          {count ? <span className={selected ? "text-white/75" : "text-fleet-ember"}>{count}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function DriverWithdrawalSection({
  withdrawals,
  busyAction,
  onReview
}: {
  withdrawals: AdminWithdrawal[];
  busyAction: string | null;
  onReview: (id: string, status: "approved" | "rejected" | "paid") => void;
}) {
  return (
    <Card id="withdrawal-review" className="scroll-mt-24 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-fleet-line p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-night text-white">
            <CircleDollarSign className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-black text-fleet-night">Driver withdrawal section</h2>
            <span className="text-sm font-bold text-slate-500">Approve, reject with reason, or mark credited</span>
          </div>
        </div>
        <StatusBadge tone="amber">{withdrawals.filter((withdrawal) => withdrawal.status === "pending").length} pending</StatusBadge>
      </div>
      <div className="grid gap-3 p-4">
        {withdrawals.map((withdrawal) => {
          const rider = withdrawal.rider_profiles?.users;
          const driverName = rider?.full_name || withdrawal.account_name || "Driver";
          const canAct = withdrawal.status === "pending";
          return (
            <article key={withdrawal.id} className="rounded-fleet border border-fleet-line bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <strong className="block text-lg font-black text-fleet-night">{driverName}</strong>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {withdrawal.bank_name} · {withdrawal.account_number} · {withdrawal.account_name || "No account name"}
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    KYC: {withdrawal.rider_profiles?.application_status || "unknown"} · Zone: {withdrawal.rider_profiles?.operating_zone || "not set"}
                  </span>
                </div>
                <div className="text-left sm:text-right">
                  <strong className="block text-2xl font-black text-fleet-night">{formatMoney(Number(withdrawal.amount_ngn || 0))}</strong>
                  <StatusBadge tone={withdrawal.status === "approved" || withdrawal.status === "paid" ? "green" : withdrawal.status === "rejected" ? "red" : "amber"}>
                    {withdrawal.status}
                  </StatusBadge>
                </div>
              </div>
              {withdrawal.rejection_reason ? (
                <div className="mt-3 rounded-fleet bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-700">{withdrawal.rejection_reason}</div>
              ) : null}
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onReview(withdrawal.id, "approved")}
                  disabled={!canAct || busyAction === `withdrawal:${withdrawal.id}:approved`}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onReview(withdrawal.id, "rejected")}
                  disabled={!canAct || busyAction === `withdrawal:${withdrawal.id}:rejected`}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="dark"
                  onClick={() => onReview(withdrawal.id, "paid")}
                  disabled={withdrawal.status !== "approved" || busyAction === `withdrawal:${withdrawal.id}:paid`}
                >
                  Mark paid
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

function CompanyTransactionSection({
  form,
  logs,
  summary,
  search,
  category,
  busyAction,
  onFormChange,
  onSubmit,
  onReset,
  onSearchChange,
  onCategoryChange,
  onEdit,
  onExport
}: {
  form: CompanyTransactionForm;
  logs: CompanyTransactionLog[];
  summary: { income: number; expenses: number; transfers: number; net: number; pending: number; flagged: number };
  search: string;
  category: "all" | CompanyTransactionCategory;
  busyAction: string | null;
  onFormChange: (patch: Partial<CompanyTransactionForm>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: "all" | CompanyTransactionCategory) => void;
  onEdit: (log: CompanyTransactionLog) => void;
  onExport: () => void;
}) {
  const saving = busyAction === "company-log:save";
  return (
    <Card id="company-transaction-logs" className="mt-6 overflow-hidden">
      <div className="grid gap-0 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="border-b border-fleet-line p-5 xl:border-b-0 xl:border-r">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Company books</span>
              <h2 className="mt-1 text-2xl font-black text-fleet-night">Transaction logs</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                Record delivery income, vehicle maintenance, site maintenance, payroll, fuel, permits, supplier payments, and every operational expense.
              </p>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-fleet bg-fleet-night text-white">
              <ReceiptText className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <FinanceStat label="Income" value={formatLedgerMoney(summary.income)} tone="text-emerald-700" />
            <FinanceStat label="Expenses" value={formatLedgerMoney(summary.expenses)} tone="text-rose-700" />
            <FinanceStat label="Net position" value={formatLedgerMoney(summary.net)} tone={summary.net >= 0 ? "text-fleet-night" : "text-rose-700"} />
            <FinanceStat label="Attention" value={`${summary.pending} pending / ${summary.flagged} flagged`} tone="text-amber-700" />
          </div>

          <form className="mt-5 grid gap-3" onSubmit={onSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="form-field">
                <span className="form-label">Date</span>
                <span className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className="form-input pl-10" type="date" value={form.entry_date} onChange={(event) => onFormChange({ entry_date: event.target.value })} />
                </span>
              </label>
              <label className="form-field">
                <span className="form-label">Category</span>
                <select className="form-input" value={form.category} onChange={(event) => onFormChange({ category: event.target.value as CompanyTransactionCategory })}>
                  {companyTransactionCategories.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="form-field">
                <span className="form-label">Direction</span>
                <select className="form-input" value={form.direction} onChange={(event) => onFormChange({ direction: event.target.value as CompanyTransactionDirection })}>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
              <label className="form-field sm:col-span-2">
                <span className="form-label">Amount</span>
                <input className="form-input" value={form.amount_ngn} onChange={(event) => onFormChange({ amount_ngn: event.target.value })} inputMode="decimal" placeholder="0" />
              </label>
            </div>

            <label className="form-field">
              <span className="form-label">Title</span>
              <input className="form-input" value={form.title} onChange={(event) => onFormChange({ title: event.target.value })} placeholder="e.g. Brake pads and oil service" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="form-field">
                <span className="form-label">Counterparty</span>
                <input className="form-input" value={form.counterparty} onChange={(event) => onFormChange({ counterparty: event.target.value })} placeholder="Vendor, customer, staff" />
              </label>
              <label className="form-field">
                <span className="form-label">Reference</span>
                <input className="form-input" value={form.reference} onChange={(event) => onFormChange({ reference: event.target.value })} placeholder="Invoice or payout ref" />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="form-field">
                <span className="form-label">Payment method</span>
                <input className="form-input" value={form.payment_method} onChange={(event) => onFormChange({ payment_method: event.target.value })} placeholder="Transfer, cash, card" />
              </label>
              <label className="form-field">
                <span className="form-label">Status</span>
                <select className="form-input" value={form.status} onChange={(event) => onFormChange({ status: event.target.value as CompanyTransactionStatus })}>
                  <option value="pending">Pending</option>
                  <option value="cleared">Cleared</option>
                  <option value="flagged">Flagged</option>
                </select>
              </label>
            </div>

            <label className="form-field">
              <span className="form-label">Notes</span>
              <textarea className="form-input min-h-24 resize-y" value={form.notes} onChange={(event) => onFormChange({ notes: event.target.value })} placeholder="What should the company remember about this record?" />
            </label>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Button type="submit" disabled={saving || !form.title.trim() || !form.amount_ngn.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {form.id ? "Update log" : "Add log"}
              </Button>
              <Button type="button" variant="secondary" onClick={onReset}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
          </form>
        </div>

        <div className="p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Ledger</span>
              <h3 className="mt-1 text-xl font-black text-fleet-night">Recent records</h3>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={onExport} disabled={logs.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
            <label className="form-field">
              <span className="form-label">Search records</span>
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="form-input pl-10" value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Title, vendor, ref, notes" />
              </span>
            </label>
            <label className="form-field">
              <span className="form-label">Filter</span>
              <select className="form-input" value={category} onChange={(event) => onCategoryChange(event.target.value as "all" | CompanyTransactionCategory)}>
                <option value="all">All categories</option>
                {companyTransactionCategories.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 max-h-[640px] overflow-auto rounded-fleet border border-fleet-line">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 bg-fleet-paper text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-fleet-line bg-white align-top">
                    <td className="px-4 py-4">
                      <strong className="block font-black text-fleet-night">{log.title}</strong>
                      <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                        {formatLogDate(log.entry_date)} · {log.counterparty || "No counterparty"} · {log.reference || "No reference"}
                      </span>
                      {log.notes ? <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{log.notes}</span> : null}
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-600">{categoryLabel(log.category)}</td>
                    <td className="px-4 py-4">
                      <strong className={log.direction === "income" ? "text-emerald-700" : log.direction === "expense" ? "text-rose-700" : "text-slate-700"}>
                        {log.direction === "income" ? "+" : log.direction === "expense" ? "-" : ""}
                        {formatMoney(Number(log.amount_ngn || 0))}
                      </strong>
                      <span className="mt-1 block text-xs font-bold capitalize text-slate-500">{log.direction}</span>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge tone={companyLogStatusTone(log.status)}>{log.status}</StatusBadge>
                    </td>
                    <td className="px-4 py-4">
                      <Button type="button" size="sm" variant="secondary" onClick={() => onEdit(log)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm font-bold text-slate-500" colSpan={5}>
                      No company transaction logs match this view.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}

function RestaurantMenuSection({
  restaurants,
  busyAction,
  onKitchenChange,
  onItemChange,
  onAddItem,
  onRemoveItem,
  onSave
}: {
  restaurants: RestaurantKitchen[];
  busyAction: string | null;
  onKitchenChange: (kitchenId: string, patch: Partial<RestaurantKitchen>) => void;
  onItemChange: (kitchenId: string, itemId: string, patch: Partial<RestaurantMenuItem>) => void;
  onAddItem: (kitchenId: string) => void;
  onRemoveItem: (kitchenId: string, itemId: string) => void;
  onSave: () => void;
}) {
  const saving = busyAction === "restaurants:save";

  return (
    <Card id="restaurant-menus" className="mt-6 scroll-mt-24 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-fleet-line p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-fleet-night text-white">
            <StoreIcon className="h-5 w-5" />
          </span>
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Kitchen authority</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night">Restaurant menus and pricing</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              Update each kitchen profile, portion price, meal photo, and new food item. These records feed the public restaurant marketplace.
            </p>
          </div>
        </div>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save restaurant menus
        </Button>
      </div>

      <div className="grid gap-5 p-4">
        {restaurants.map((kitchen) => (
          <article key={kitchen.id} className="rounded-fleet border border-fleet-line bg-white p-4">
            <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
              <img src={kitchen.imageUrl} alt={kitchen.name} className="h-44 w-full rounded-fleet object-cover lg:h-full" />
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="form-field">
                    <span className="form-label">Kitchen name</span>
                    <input className="form-input" value={kitchen.name} onChange={(event) => onKitchenChange(kitchen.id, { name: event.target.value })} />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Area</span>
                    <input className="form-input" value={kitchen.area} onChange={(event) => onKitchenChange(kitchen.id, { area: event.target.value })} />
                  </label>
                </div>
                <label className="form-field">
                  <span className="form-label">Address</span>
                  <input className="form-input" value={kitchen.address} onChange={(event) => onKitchenChange(kitchen.id, { address: event.target.value })} />
                </label>
                <label className="form-field">
                  <span className="form-label">Description</span>
                  <textarea className="form-input min-h-20" value={kitchen.description} onChange={(event) => onKitchenChange(kitchen.id, { description: event.target.value })} />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="form-field">
                    <span className="form-label">Meal types</span>
                    <input
                      className="form-input"
                      value={kitchen.mealTypes.join(", ")}
                      onChange={(event) =>
                        onKitchenChange(kitchen.id, {
                          mealTypes: event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                        })
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Restaurant photo URL</span>
                    <input className="form-input" value={kitchen.imageUrl} onChange={(event) => onKitchenChange(kitchen.id, { imageUrl: event.target.value })} />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-fleet-night">{kitchen.name} food items</h3>
                <span className="text-sm font-bold text-slate-500">Each price is sold as the portion shown.</span>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => onAddItem(kitchen.id)}>
                <Plus className="h-4 w-4" />
                Add new food item
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              {kitchen.items.map((item) => (
                <div key={item.id} className="grid gap-3 rounded-fleet border border-fleet-line bg-fleet-paper p-3 xl:grid-cols-[64px_1.2fr_0.8fr_120px_0.8fr_1fr_auto] xl:items-end">
                  <img src={item.imageUrl} alt={item.name} className="h-16 w-16 rounded-fleet object-cover" />
                  <label className="form-field">
                    <span className="form-label">Food item</span>
                    <input className="form-input bg-white" value={item.name} onChange={(event) => onItemChange(kitchen.id, item.id, { name: event.target.value })} />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Meal type</span>
                    <input className="form-input bg-white" value={item.type} onChange={(event) => onItemChange(kitchen.id, item.id, { type: event.target.value })} />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Price</span>
                    <input
                      className="form-input bg-white"
                      value={String(item.price)}
                      onChange={(event) => onItemChange(kitchen.id, item.id, { price: Number(event.target.value || 0) })}
                      inputMode="numeric"
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Portion</span>
                    <input className="form-input bg-white" value={item.portion} onChange={(event) => onItemChange(kitchen.id, item.id, { portion: event.target.value })} />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Small photo URL</span>
                    <input className="form-input bg-white" value={item.imageUrl} onChange={(event) => onItemChange(kitchen.id, item.id, { imageUrl: event.target.value })} />
                  </label>
                  <Button type="button" size="sm" variant="secondary" onClick={() => onRemoveItem(kitchen.id, item.id)} disabled={kitchen.items.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function MallMenuSection({
  malls,
  busyAction,
  onMallChange,
  onStoreChange,
  onProductChange,
  onSave
}: {
  malls: ShoppingMall[];
  busyAction: string | null;
  onMallChange: (mallId: string, patch: Partial<ShoppingMall>) => void;
  onStoreChange: (mallId: string, storeId: string, patch: Partial<MallStore>) => void;
  onProductChange: (mallId: string, storeId: string, productId: string, patch: Partial<MallProduct>) => void;
  onSave: () => void;
}) {
  const saving = busyAction === "malls:save";

  return (
    <Card id="mall-menus" className="mt-6 scroll-mt-24 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-fleet-line p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-fleet-night text-white">
            <StoreIcon className="h-5 w-5" />
          </span>
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Mall authority</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night">Shopping malls, vendors, and products</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              Update each mall container, store category, product price, availability, and Ask Price status. Prices stay vendor-specific.
            </p>
          </div>
        </div>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save mall menus
        </Button>
      </div>

      <div className="grid gap-5 p-4">
        {malls.map((mall) => (
          <article key={mall.id} className="rounded-fleet border border-fleet-line bg-white p-4">
            <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
              <img src={mall.image} alt={mall.name} className="h-44 w-full rounded-fleet object-cover lg:h-full" />
              <div className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="form-field">
                    <span className="form-label">Mall name</span>
                    <input className="form-input" value={mall.name} onChange={(event) => onMallChange(mall.id, { name: event.target.value })} />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Location</span>
                    <input className="form-input" value={mall.location} onChange={(event) => onMallChange(mall.id, { location: event.target.value })} />
                  </label>
                </div>
                <label className="form-field">
                  <span className="form-label">Mall photo URL</span>
                  <input className="form-input" value={mall.image} onChange={(event) => onMallChange(mall.id, { image: event.target.value })} />
                </label>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              {mall.stores.map((store) => (
                <div key={store.id} className="rounded-fleet border border-fleet-line bg-fleet-paper p-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                    <label className="form-field">
                      <span className="form-label">Vendor / store</span>
                      <input className="form-input bg-white" value={store.name} onChange={(event) => onStoreChange(mall.id, store.id, { name: event.target.value })} />
                    </label>
                    <label className="form-field">
                      <span className="form-label">Category</span>
                      <select className="form-input bg-white" value={store.category} onChange={(event) => onStoreChange(mall.id, store.id, { category: event.target.value as MallStore["category"] })}>
                        <option value="Grocery">Grocery</option>
                        <option value="Pharmacy">Pharmacy</option>
                        <option value="Fashion">Fashion</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {store.products.map((product) => (
                      <div key={product.id} className="grid gap-3 rounded-fleet border border-fleet-line bg-white p-3 xl:grid-cols-[64px_1fr_120px_1fr_120px] xl:items-end">
                        <img src={product.image} alt={product.name} className="h-16 w-16 rounded-fleet object-cover" />
                        <label className="form-field">
                          <span className="form-label">Product</span>
                          <input className="form-input" value={product.name} onChange={(event) => onProductChange(mall.id, store.id, product.id, { name: event.target.value })} />
                        </label>
                        <label className="form-field">
                          <span className="form-label">Price</span>
                          <input
                            className="form-input"
                            value={product.price === null || product.price === "ASK_PRICE" ? "" : String(product.price)}
                            onChange={(event) => onProductChange(mall.id, store.id, product.id, { price: event.target.value ? Number(event.target.value) : "ASK_PRICE" })}
                            placeholder="Ask Price"
                            inputMode="numeric"
                          />
                        </label>
                        <label className="form-field">
                          <span className="form-label">Product photo URL</span>
                          <input className="form-input" value={product.image} onChange={(event) => onProductChange(mall.id, store.id, product.id, { image: event.target.value })} />
                        </label>
                        <label className="flex min-h-11 items-center justify-between gap-3 rounded-fleet bg-fleet-paper px-3 text-sm font-black text-fleet-night">
                          Available
                          <input type="checkbox" className="h-5 w-5 accent-fleet-navy" checked={product.available} onChange={(event) => onProductChange(mall.id, store.id, product.id, { available: event.target.checked })} />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function FinanceStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-fleet border border-fleet-line bg-fleet-paper p-4">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <strong className={`mt-2 block text-xl font-black ${tone}`}>{value}</strong>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  body,
  count,
  onClick
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  count: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-fleet border border-fleet-line bg-white p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-fleet-ember focus:outline-none focus:ring-2 focus:ring-fleet-ember"
    >
      <div className="flex items-start justify-between gap-4">
        <span>
          <Icon className="h-5 w-5 text-fleet-ember" />
          <strong className="mt-4 block text-lg font-black text-fleet-night">{title}</strong>
        </span>
        <StatusBadge tone="amber">{count}</StatusBadge>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
    </button>
  );
}

function DeliveryTimelineSection({
  deliveries,
  busyAction,
  onUpdate
}: {
  deliveries: AdminDelivery[];
  busyAction: string | null;
  onUpdate: (id: string, status: string) => void;
}) {
  const statuses = ["searching", "accepted", "picked_up", "in_transit", "delivered"];

  return (
    <Card id="delivery-timelines" className="mt-6 scroll-mt-24 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-fleet-line p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-night text-white">
            <PackageCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-black text-fleet-night">Delivery timelines</h2>
            <span className="text-sm font-bold text-slate-500">Admin updates sync to customer tracking pages</span>
          </div>
        </div>
        <StatusBadge tone="green">Realtime</StatusBadge>
      </div>
      <div className="grid gap-3 p-4">
        {deliveries.map((delivery) => {
          const customer = delivery.users?.full_name || delivery.users?.phone || "Customer";
          const rider = delivery.rider_profiles?.users?.full_name || delivery.rider_profiles?.users?.phone || "Unassigned";
          return (
            <article key={delivery.id} className="rounded-fleet border border-fleet-line bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <strong className="block text-lg font-black text-fleet-night">{delivery.delivery_code}</strong>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {delivery.pickup_address} to {delivery.dropoff_address}
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {customer} · Driver: {rider} · {formatMoney(delivery.price_ngn)}
                  </span>
                </div>
                <StatusBadge tone={delivery.status === "delivered" ? "green" : "amber"}>{delivery.status.replaceAll("_", " ")}</StatusBadge>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                {statuses.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={delivery.status === status ? "primary" : "secondary"}
                    onClick={() => onUpdate(delivery.id, status)}
                    disabled={busyAction === `delivery:${delivery.id}:${status}`}
                  >
                    {status.replaceAll("_", " ")}
                  </Button>
                ))}
              </div>
            </article>
          );
        })}
        {deliveries.length === 0 ? <div className="rounded-fleet bg-fleet-paper p-5 text-sm font-bold text-slate-500">No deliveries yet.</div> : null}
      </div>
    </Card>
  );
}

function RiderApprovalSection({
  riders,
  busyAction,
  onReview
}: {
  riders: AdminRider[];
  busyAction: string | null;
  onReview: (id: string, status: AdminRider["application_status"], riderAccountType?: RiderAccountType, options?: { tagOnly?: boolean }) => void;
}) {
  const [accountTypesByRider, setAccountTypesByRider] = useState<Record<string, RiderAccountType>>({});
  return (
    <Card id="rider-approvals" className="scroll-mt-24 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-fleet-line p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-night text-white">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-black text-fleet-night">Rider approvals</h2>
            <span className="text-sm font-bold text-slate-500">Review KYC, vehicle, zone, and status</span>
          </div>
        </div>
        <StatusBadge tone="amber">{riders.filter((rider) => !["approved", "rejected"].includes(rider.application_status)).length} pending</StatusBadge>
      </div>
      <div className="grid gap-3 p-4">
        {riders.map((rider) => {
          const riderName = rider.users?.full_name || rider.users?.phone || "Rider";
          const canAct = rider.application_status !== "approved" && rider.application_status !== "rejected";
          const canEditTag = rider.application_status !== "rejected";
          const selectedAccountType = accountTypesByRider[rider.id] || normalizeRiderAccountType(rider.rider_account_type);
          const tagChanged = selectedAccountType !== normalizeRiderAccountType(rider.rider_account_type);
          return (
            <article key={rider.id} className="rounded-fleet border border-fleet-line bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <strong className="block text-lg font-black text-fleet-night">{riderName}</strong>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {rider.vehicle_type || "Vehicle pending"} · {rider.plate_number || "No plate"} · {rider.operating_zone || "No zone"}
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {rider.users?.email || "No email"} · {rider.users?.phone || "No phone"}
                  </span>
                </div>
                <StatusBadge tone={rider.application_status === "approved" ? "green" : rider.application_status === "rejected" ? "red" : "amber"}>
                  {riderReviewLabel(rider.application_status)}
                </StatusBadge>
              </div>
              <div className="mt-3 grid gap-2 rounded-fleet bg-fleet-paper p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <span className="block text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">Rider account tag</span>
                  <strong className="mt-1 block text-sm font-black text-fleet-night">{riderAccountTypeLabel(selectedAccountType)}</strong>
                </div>
                <select
                  className="form-input min-h-10 text-sm font-black"
                  value={selectedAccountType}
                  disabled={!canEditTag}
                  onChange={(event) =>
                    setAccountTypesByRider((current) => ({
                      ...current,
                      [rider.id]: normalizeRiderAccountType(event.target.value)
                    }))
                  }
                >
                  {riderAccountTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(rider.rider_documents || []).map((doc) => (
                  <span key={doc.id} className="rounded-full bg-fleet-paper px-3 py-1 text-xs font-black capitalize text-slate-600">
                    {doc.document_type.replaceAll("_", " ")}: {doc.status.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {rider.application_status === "approved" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => onReview(rider.id, "approved", selectedAccountType, { tagOnly: true })} disabled={!tagChanged || busyAction === `rider:${rider.id}:tag`}>
                    Save tag
                  </Button>
                ) : (
                  <>
                    <Button type="button" size="sm" onClick={() => onReview(rider.id, "approved", selectedAccountType)} disabled={!canAct || busyAction === `rider:${rider.id}:approved`}>
                      Approve
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => onReview(rider.id, "more_info_required")} disabled={!canAct || busyAction === `rider:${rider.id}:more_info_required`}>
                      More info
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => onReview(rider.id, "rejected")} disabled={!canAct || busyAction === `rider:${rider.id}:rejected`}>
                      Reject
                    </Button>
                  </>
                )}
              </div>
            </article>
          );
        })}
        {riders.length === 0 ? <div className="rounded-fleet bg-fleet-paper p-5 text-sm font-bold text-slate-500">No rider applications yet.</div> : null}
      </div>
    </Card>
  );
}

function BusinessKycSection({
  businesses,
  busyAction,
  onReview
}: {
  businesses: AdminBusiness[];
  busyAction: string | null;
  onReview: (id: string, status: AdminBusiness["registration_status"]) => void;
}) {
  return (
    <Card id="business-kyc" className="scroll-mt-24 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-fleet-line p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-night text-white">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-black text-fleet-night">Business KYC</h2>
            <span className="text-sm font-bold text-slate-500">Review vendor profile, pickup address, and dispatch volume</span>
          </div>
        </div>
        <StatusBadge tone="amber">{businesses.filter((business) => business.registration_status === "submitted").length} pending</StatusBadge>
      </div>
      <div className="grid gap-3 p-4">
        {businesses.map((business) => {
          const canAct = business.registration_status === "submitted" || business.registration_status === "paused";
          return (
            <article key={business.id} className="rounded-fleet border border-fleet-line bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <strong className="block text-lg font-black text-fleet-night">{business.business_name}</strong>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {business.business_type || business.industry || "Type pending"} · {business.dispatch_volume || "Volume pending"} · Commission {Number(business.commission_rate || 0).toFixed(0)}%
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    {business.contact_name || business.users?.full_name || "No contact"} · {business.email || business.users?.email || "No email"} · {business.phone || business.users?.phone || "No phone"}
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    Pickup: {business.pickup_address || "No pickup address"}
                  </span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-slate-500">
                    CAC: {business.cac_number || "Not provided"}
                  </span>
                  {business.rejection_reason ? <span className="mt-2 block rounded-fleet bg-red-50 p-2 text-xs font-bold leading-5 text-red-700">Reason: {business.rejection_reason}</span> : null}
                </div>
                <StatusBadge tone={business.registration_status === "active" ? "green" : business.registration_status === "rejected" ? "red" : "amber"}>
                  {businessReviewLabel(business.registration_status)}
                </StatusBadge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(business.business_documents || []).map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.file_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-fleet-paper px-3 py-1 text-xs font-black capitalize text-slate-600 transition hover:bg-fleet-navy hover:text-white"
                  >
                    {doc.document_type.replaceAll("_", " ")}: {doc.status.replaceAll("_", " ")}
                  </a>
                ))}
                {!business.business_documents?.length ? (
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">No KYC documents uploaded</span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Button type="button" size="sm" onClick={() => onReview(business.id, "active")} disabled={!canAct || busyAction === `business:${business.id}:active`}>
                  Accept
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onReview(business.id, "paused")} disabled={business.registration_status === "active" || busyAction === `business:${business.id}:paused`}>
                  Pause
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onReview(business.id, "rejected")} disabled={business.registration_status === "active" || business.registration_status === "rejected" || busyAction === `business:${business.id}:rejected`}>
                  Reject
                </Button>
              </div>
            </article>
          );
        })}
        {businesses.length === 0 ? <div className="rounded-fleet bg-fleet-paper p-5 text-sm font-bold text-slate-500">No business KYC requests yet.</div> : null}
      </div>
    </Card>
  );
}

function SiteControlsSection({
  controls,
  busyAction,
  onChange,
  onWalletPolicyChange,
  onSave
}: {
  controls: SiteControls;
  busyAction: string | null;
  onChange: (patch: Partial<SiteControls>) => void;
  onWalletPolicyChange: (patch: Partial<SiteControls["wallet_policy"]>) => void;
  onSave: () => void;
}) {
  const saving = busyAction === "site-controls:save";
  return (
    <Card id="site-controls" className="scroll-mt-24 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Site authority</span>
          <h2 className="mt-1 text-2xl font-black text-fleet-night">Editable platform controls</h2>
        </div>
        <FilePenLine className="h-5 w-5 text-fleet-ember" />
      </div>
      <div className="mt-5 grid gap-3">
        {[
          ["Bookings", "bookings_enabled"],
          ["Rider onboarding", "rider_onboarding_enabled"],
          ["Wallet top-ups", "wallet_topups_enabled"],
          ["Rider withdrawals", "withdrawals_enabled"]
        ].map(([label, key]) => (
          <label key={key} className="flex items-center justify-between gap-4 rounded-fleet border border-fleet-line bg-white p-4">
            <span>
              <strong className="block text-sm font-black text-fleet-night">{label}</strong>
              <span className="text-xs font-bold text-slate-500">{controls[key as keyof SiteControls] ? "Enabled" : "Paused"}</span>
            </span>
            <input
              type="checkbox"
              checked={Boolean(controls[key as keyof SiteControls])}
              onChange={(event) => onChange({ [key]: event.target.checked } as Partial<SiteControls>)}
              className="h-5 w-5 accent-fleet-ember"
            />
          </label>
        ))}
        <label className="form-field">
          <span className="form-label">Support flow</span>
          <select className="form-input" value={controls.support_status} onChange={(event) => onChange({ support_status: event.target.value as SiteControls["support_status"] })}>
            <option value="open">Open</option>
            <option value="priority_only">Priority only</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">Launch headline</span>
          <input className="form-input" value={controls.launch_headline} onChange={(event) => onChange({ launch_headline: event.target.value })} />
        </label>
        <label className="form-field">
          <span className="form-label">Launch message</span>
          <textarea className="form-input min-h-20" value={controls.launch_message} onChange={(event) => onChange({ launch_message: event.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <AdminNumberInput label="Min top-up" value={controls.wallet_policy.min_topup_ngn} onChange={(value) => onWalletPolicyChange({ min_topup_ngn: value })} />
          <AdminNumberInput label="Min withdrawal" value={controls.wallet_policy.min_withdrawal_ngn} onChange={(value) => onWalletPolicyChange({ min_withdrawal_ngn: value })} />
          <AdminNumberInput label="Max withdrawal" value={controls.wallet_policy.max_withdrawal_ngn} onChange={(value) => onWalletPolicyChange({ max_withdrawal_ngn: value })} />
          <AdminNumberInput label="Payout SLA hours" value={controls.wallet_policy.payout_sla_hours} onChange={(value) => onWalletPolicyChange({ payout_sla_hours: value })} />
        </div>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save site controls
        </Button>
      </div>
    </Card>
  );
}

function RiskSignalsSection({
  riskSignals,
  supportTickets,
  busyAction,
  onResolveRisk,
  onUpdateSupport,
  replyDrafts,
  onReplyDraftChange,
  onSendSupportReply
}: {
  riskSignals: RiskSignal[];
  supportTickets: SupportTicket[];
  busyAction: string | null;
  onResolveRisk: (id: string) => void;
  onUpdateSupport: (id: string, status: SupportTicket["status"]) => void;
  replyDrafts: Record<string, string>;
  onReplyDraftChange: (id: string, value: string) => void;
  onSendSupportReply: (id: string) => void;
}) {
  return (
    <Card id="risk-signals" className="mt-6 scroll-mt-24 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-fleet-line p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-night text-white">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-black text-fleet-night">Risk signals and support flow</h2>
            <span className="text-sm font-bold text-slate-500">Resolve fraud signals and move support tickets</span>
          </div>
        </div>
        <StatusBadge tone="red">{riskSignals.filter((item) => !item.resolved_at).length} flags</StatusBadge>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <div className="grid gap-3">
          {riskSignals.map((signal) => (
            <article key={signal.id} className="rounded-fleet border border-fleet-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="block text-base font-black capitalize text-fleet-night">{signal.signal_type.replaceAll("_", " ")}</strong>
                  <span className="mt-1 block text-xs font-bold text-slate-500">
                    {signal.users?.full_name || signal.users?.email || "Unknown user"} · {signal.deliveries?.delivery_code || "No delivery"}
                  </span>
                </div>
                <StatusBadge tone={signal.resolved_at ? "green" : signal.risk_score >= 75 ? "red" : "amber"}>{signal.resolved_at ? "resolved" : `${signal.risk_score}%`}</StatusBadge>
              </div>
              <p className="mt-3 text-xs font-bold leading-5 text-slate-500">{riskSignalDetail(signal.details)}</p>
              <Button type="button" size="sm" className="mt-3" onClick={() => onResolveRisk(signal.id)} disabled={Boolean(signal.resolved_at) || busyAction === `risk:${signal.id}`}>
                Resolve signal
              </Button>
            </article>
          ))}
          {riskSignals.length === 0 ? <div className="rounded-fleet bg-fleet-paper p-5 text-sm font-bold text-slate-500">No risk signals yet.</div> : null}
        </div>
        <div className="grid gap-3">
          {supportTickets.map((ticket) => (
            <article key={ticket.id} className="rounded-fleet border border-fleet-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="block text-base font-black text-fleet-night">{ticket.subject || ticket.topic}</strong>
                  <span className="mt-1 block text-xs font-bold text-slate-500">
                    {ticket.contact_name || ticket.contact_email || "Customer"} · {ticket.priority}
                  </span>
                </div>
                <StatusBadge tone={ticket.status === "resolved" || ticket.status === "closed" ? "green" : ticket.priority === "urgent" ? "red" : "amber"}>{ticket.status.replaceAll("_", " ")}</StatusBadge>
              </div>
              <p className="mt-3 text-xs font-bold leading-5 text-slate-500">{ticket.message}</p>
              {ticket.support_messages?.length ? (
                <div className="mt-3 grid gap-2 rounded-fleet bg-fleet-paper p-3">
                  {ticket.support_messages.slice(-4).map((message) => (
                    <div key={message.id} className="rounded-fleet bg-white p-2">
                      <span className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-400">{message.sender_type}</span>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{message.body}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2">
                <textarea
                  className="form-textarea min-h-20"
                  value={replyDrafts[ticket.id] || ""}
                  onChange={(event) => onReplyDraftChange(ticket.id, event.target.value)}
                  placeholder="Reply to this customer"
                />
                <Button type="button" size="sm" onClick={() => onSendSupportReply(ticket.id)} disabled={busyAction === `support:${ticket.id}:reply`}>
                  <Send className="h-4 w-4" />
                  Send reply
                </Button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(["in_progress", "resolved", "closed"] as SupportTicket["status"][]).map((status) => (
                  <Button key={status} type="button" size="sm" variant={status === "in_progress" ? "primary" : "secondary"} onClick={() => onUpdateSupport(ticket.id, status)} disabled={busyAction === `support:${ticket.id}:${status}` || ticket.status === status}>
                    {status.replaceAll("_", " ")}
                  </Button>
                ))}
              </div>
            </article>
          ))}
          {supportTickets.length === 0 ? <div className="rounded-fleet bg-fleet-paper p-5 text-sm font-bold text-slate-500">No support tickets yet.</div> : null}
        </div>
      </div>
    </Card>
  );
}

function OpsPanel({ icon: Icon, title, value, helper }: { icon: LucideIcon; title: string; value: string; helper: string }) {
  return (
    <Card className="p-5">
      <Icon className="h-5 w-5 text-fleet-ember" />
      <strong className="mt-4 block text-3xl font-black text-fleet-night">{value}</strong>
      <h3 className="mt-2 text-lg font-black text-fleet-night">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{helper}</p>
    </Card>
  );
}

function AdminInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" />
    </label>
  );
}

function AdminNumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <input className="form-input" value={String(value)} onChange={(event) => onChange(Number(event.target.value || 0))} inputMode="numeric" />
    </label>
  );
}

function riskSignalDetail(details: Record<string, unknown> | null) {
  if (!details) return "No extra detail supplied.";
  const reason = details.reason || details.message || details.description;
  if (typeof reason === "string" && reason.trim()) return reason;
  return Object.entries(details)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function summarizeCompanyLogs(logs: CompanyTransactionLog[]) {
  return logs.reduce(
    (summary, log) => {
      const amount = Number(log.amount_ngn || 0);
      if (log.direction === "income") summary.income += amount;
      if (log.direction === "expense") summary.expenses += amount;
      if (log.direction === "transfer") summary.transfers += amount;
      if (log.status === "pending") summary.pending += 1;
      if (log.status === "flagged") summary.flagged += 1;
      summary.net = summary.income - summary.expenses;
      return summary;
    },
    { income: 0, expenses: 0, transfers: 0, net: 0, pending: 0, flagged: 0 }
  );
}

function categoryLabel(category: CompanyTransactionCategory) {
  return companyTransactionCategories.find((item) => item.value === category)?.label || "Other";
}

function companyLogStatusTone(status: CompanyTransactionStatus): "green" | "amber" | "red" {
  if (status === "cleared") return "green";
  if (status === "flagged") return "red";
  return "amber";
}

function formatLogDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatLedgerMoney(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0
  }).format(Math.round(value || 0));
}

function readDemoCompanyLogs() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(companyLogStorageKey) || "[]");
    return Array.isArray(parsed) ? (parsed as CompanyTransactionLog[]) : [];
  } catch {
    return [];
  }
}

function writeDemoCompanyLogs(logs: CompanyTransactionLog[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(companyLogStorageKey, JSON.stringify(logs));
}

function readDemoRestaurantMenus() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(restaurantMenuStorageKey) || "[]");
    return Array.isArray(parsed) ? normalizeRestaurantKitchens(parsed) : [];
  } catch {
    return [];
  }
}

function writeDemoRestaurantMenus(restaurants: RestaurantKitchen[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(restaurantMenuStorageKey, JSON.stringify(restaurants));
}

function readDemoMallMenus() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(mallMenuStorageKey) || "[]");
    return Array.isArray(parsed) ? normalizeShoppingMalls(parsed) : [];
  } catch {
    return [];
  }
}

function writeDemoMallMenus(malls: ShoppingMall[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(mallMenuStorageKey, JSON.stringify(malls));
}

function businessReviewLabel(status: AdminBusiness["registration_status"]) {
  if (status === "active") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "paused") return "Paused";
  return "Pending";
}

function upsertCompanyLog(logs: CompanyTransactionLog[], log: CompanyTransactionLog) {
  const next = logs.some((item) => item.id === log.id)
    ? logs.map((item) => (item.id === log.id ? log : item))
    : [log, ...logs];
  return next.sort((first, second) => `${second.entry_date}${second.created_at}`.localeCompare(`${first.entry_date}${first.created_at}`));
}

function toLocalCompanyLog(
  payload: {
    id?: string;
    entry_date: string;
    category: CompanyTransactionCategory;
    direction: CompanyTransactionDirection;
    amount_ngn: number;
    title: string;
    counterparty: string;
    reference: string;
    payment_method: string;
    status: CompanyTransactionStatus;
    notes: string;
  },
  id?: string
): CompanyTransactionLog {
  const now = new Date().toISOString();
  const existing = id ? readDemoCompanyLogs().find((log) => log.id === id) : undefined;
  return {
    id: id || `LOCAL-${Date.now()}`,
    entry_date: payload.entry_date,
    category: payload.category,
    direction: payload.direction,
    amount_ngn: payload.amount_ngn,
    title: payload.title,
    counterparty: payload.counterparty || null,
    reference: payload.reference || null,
    payment_method: payload.payment_method || null,
    status: payload.status,
    notes: payload.notes || null,
    created_at: existing?.created_at || now,
    updated_at: now
  };
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
