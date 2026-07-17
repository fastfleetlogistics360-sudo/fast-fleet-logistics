export const businessCommissionRates = {
  Restaurant: 10,
  Mall: 10,
  Grocery: 10,
  Pharmacy: 5,
  Fashion: 10,
  Electronics: 10,
  Gadgets: 10
} as const;

export type BusinessCommissionType = keyof typeof businessCommissionRates;

export function normalizeBusinessCommissionType(value: unknown): BusinessCommissionType | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const aliases: Record<string, BusinessCommissionType> = {
    shopping: "Mall",
    pharmacy: "Pharmacy",
    "med / pharmacy": "Pharmacy",
    medicine: "Pharmacy"
  };
  const normalized = aliases[raw.toLowerCase()] || raw;
  return normalized in businessCommissionRates ? (normalized as BusinessCommissionType) : null;
}

export function businessCommissionRate(value: unknown): number {
  const businessType = normalizeBusinessCommissionType(value);
  return businessType ? businessCommissionRates[businessType] : 10;
}
