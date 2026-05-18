import type { UserRole } from "@/types/domain";

export const roleHome: Record<UserRole, string> = {
  customer: "/dashboard",
  rider: "/rider/dashboard",
  business: "/business/dashboard",
  admin: "/admin"
};

export function normalizeRole(value: unknown): UserRole {
  if (value === "rider" || value === "business" || value === "admin") return value;
  return "customer";
}
