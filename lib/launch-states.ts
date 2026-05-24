export const DEFAULT_LIVE_STATES = ["Lagos", "Ogun"] as const;
export const SUPPORTED_LAUNCH_STATES = DEFAULT_LIVE_STATES;

export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Federal Capital Territory",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara"
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];
export type LaunchStateStatus = "active" | "live" | "beta" | "waitlist" | "paused";

export type LaunchStateRecord = {
  state: NigerianState;
  status: LaunchStateStatus;
  waitlist_count?: number;
  launched_at?: string | null;
};

export function normalizeState(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "abuja" || normalized === "abuja fct" || normalized === "fct") return "Federal Capital Territory";
  return NIGERIAN_STATES.find((state) => state.toLowerCase() === normalized) || "";
}

export function normalizeLaunchStatus(value: string | null | undefined): LaunchStateStatus {
  if (value === "active" || value === "live" || value === "beta" || value === "paused") return value;
  return "waitlist";
}

export function isOperationalLaunchStatus(status: string | null | undefined) {
  const normalized = normalizeLaunchStatus(status);
  return normalized === "active" || normalized === "live";
}

export function launchStatusLabel(status: string | null | undefined) {
  const normalized = normalizeLaunchStatus(status);
  if (normalized === "active" || normalized === "live") return "Active";
  if (normalized === "beta") return "Beta access";
  if (normalized === "paused") return "Paused";
  return "Launching soon";
}

export function rolloutWaveForState(state: string | null | undefined, status: string | null | undefined = "waitlist") {
  const normalizedState = normalizeState(state);
  const normalizedStatus = normalizeLaunchStatus(status);
  if (isOperationalLaunchStatus(normalizedStatus)) return "Live operations";
  if (normalizedStatus === "beta") return "Pilot partner wave";
  if (normalizedStatus === "paused") return "Operations paused";
  const index = NIGERIAN_STATES.findIndex((item) => item === normalizedState);
  if (index < 0) return "Expansion queue";
  return `Expansion wave ${Math.floor(index / 6) + 1}`;
}

export function isLaunchState(value: string | null | undefined, liveStates: readonly string[] = DEFAULT_LIVE_STATES) {
  const state = normalizeState(value);
  return liveStates.some((supported) => supported.toLowerCase() === state.toLowerCase());
}

export function launchStateLabel(liveStates: readonly string[] = DEFAULT_LIVE_STATES) {
  return liveStates.join(liveStates.length === 2 ? " and " : ", ");
}

export function defaultLaunchStateRecords(): LaunchStateRecord[] {
  return NIGERIAN_STATES.map((state) => ({
    state,
    status: DEFAULT_LIVE_STATES.includes(state as (typeof DEFAULT_LIVE_STATES)[number]) ? "active" : "waitlist",
    waitlist_count: 0,
    launched_at: DEFAULT_LIVE_STATES.includes(state as (typeof DEFAULT_LIVE_STATES)[number]) ? new Date(0).toISOString() : null
  }));
}

export function localLiveStates() {
  if (typeof window === "undefined") return [...DEFAULT_LIVE_STATES];
  try {
    const stored = JSON.parse(window.localStorage.getItem("fastfleet.launch.liveStates") || "[]");
    if (Array.isArray(stored) && stored.length > 0) {
      return Array.from(new Set([...DEFAULT_LIVE_STATES, ...stored.map((item) => normalizeState(String(item))).filter(Boolean)]));
    }
  } catch {
    return [...DEFAULT_LIVE_STATES];
  }
  return [...DEFAULT_LIVE_STATES];
}

export function rememberLiveState(state: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeState(state);
  if (!normalized) return;
  const next = Array.from(new Set([...localLiveStates(), normalized]));
  window.localStorage.setItem("fastfleet.launch.liveStates", JSON.stringify(next));
}
