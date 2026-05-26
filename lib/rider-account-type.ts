export type RiderAccountType = "independent" | "fastfleets360";

export const riderAccountTypes: Array<{ value: RiderAccountType; label: string }> = [
  { value: "independent", label: "Independent Rider" },
  { value: "fastfleets360", label: "Fast Fleets 360 Rider" }
];

export function normalizeRiderAccountType(value: unknown): RiderAccountType {
  return value === "fastfleets360" ? "fastfleets360" : "independent";
}

export function riderAccountTypeLabel(value: unknown) {
  return riderAccountTypes.find((item) => item.value === normalizeRiderAccountType(value))?.label || "Independent Rider";
}
