export type ReturningProfile = {
  firstName: string;
  email?: string;
  updatedAt: string;
};

const storageKey = "fastfleets.returning-profile";

function firstNameFrom(value: string | null | undefined) {
  const [firstName] = (value || "").trim().split(/\s+/);
  return firstName || "there";
}

export function readReturningProfile(): ReturningProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) || "null") as Partial<ReturningProfile> | null;
    if (!stored || typeof stored.firstName !== "string" || !stored.firstName.trim()) return null;

    return {
      firstName: firstNameFrom(stored.firstName),
      email: typeof stored.email === "string" && stored.email.includes("@") ? stored.email : undefined,
      updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export function saveReturningProfile({ fullName, email }: { fullName?: string | null; email?: string | null }) {
  if (typeof window === "undefined") return;

  const firstName = firstNameFrom(fullName || email?.split("@")[0]);
  if (firstName === "there") return;

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        firstName,
        ...(email?.includes("@") ? { email } : {}),
        updatedAt: new Date().toISOString()
      } satisfies ReturningProfile)
    );
  } catch {
    // A blocked local-storage environment should not block authentication.
  }
}
