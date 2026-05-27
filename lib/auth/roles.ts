import type { UserRole } from "@/types/domain";

export const roleHome: Record<UserRole, string> = {
  customer: "/customer/dashboard",
  rider: "/rider/dashboard",
  business: "/business/dashboard",
  admin: "/admin/dashboard"
};

export const roleSignupHome: Record<UserRole, string> = {
  customer: "/customer/dashboard",
  rider: "/rider/onboarding",
  business: "/business/register",
  admin: "/admin/dashboard"
};

export const legacyRoleHome: Record<UserRole, string> = {
  customer: "/dashboard",
  rider: "/rider/dashboard",
  business: "/business/dashboard",
  admin: "/admin"
};

export function normalizeRole(value: unknown): UserRole {
  if (value === "rider" || value === "business" || value === "admin") return value;
  return "customer";
}

export function parseUserRole(value: unknown): UserRole | null {
  if (value === "customer" || value === "rider" || value === "business" || value === "admin") return value;
  if (value === "driver") return "rider";
  return null;
}

export function safeDashboardRedirectForRole(value: string | null | undefined, role: UserRole) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return roleHome[role];
  if (role === "admin") return value.startsWith("/admin") ? value : roleHome.admin;
  if (role === "rider") return value.startsWith("/rider/dashboard") || value.startsWith("/rider/onboarding") ? value : roleHome.rider;
  if (role === "business") return value.startsWith("/business/dashboard") || value.startsWith("/business/register") ? value : roleHome.business;
  if (value.startsWith("/rider") || value.startsWith("/business") || value.startsWith("/admin")) return roleHome.customer;
  return value;
}
