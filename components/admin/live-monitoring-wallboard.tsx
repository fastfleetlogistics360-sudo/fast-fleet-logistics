"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Expand, RefreshCw, ServerCrash, ShieldCheck, Wifi } from "lucide-react";

type ServiceState = "healthy" | "degraded" | "down";
type MonitorState = ServiceState | "checking";

type HealthCheck = {
  id: string;
  label: string;
  group: "customer" | "admin" | "fastErrand" | "drivers" | "payments" | "platform";
  state: ServiceState;
  detail: string;
  durationMs: number;
};

type MonitoringSnapshot = {
  checkedAt: string;
  overall: ServiceState;
  groupStates: Record<HealthCheck["group"], ServiceState>;
  checks: HealthCheck[];
};

const monitorGroups: Array<{ id: HealthCheck["group"]; label: string; description: string }> = [
  { id: "customer", label: "Customer App", description: "Customer-facing services" },
  { id: "admin", label: "Admin Console", description: "Protected operations workspace" },
  { id: "fastErrand", label: "FastErrand", description: "Catalogue and fulfilment" },
  { id: "drivers", label: "Driver Operations", description: "Bicycle, motorcycle and dispatch" },
  { id: "payments", label: "Payments", description: "Payment processing" },
  { id: "platform", label: "API & Database", description: "Platform services" }
];

const stateCopy: Record<MonitorState, { label: string; description: string; dot: string; panel: string; icon: typeof CheckCircle2 }> = {
  checking: {
    label: "CHECKING",
    description: "Running live checks",
    dot: "animate-pulse bg-slate-400 shadow-[0_0_16px_rgba(148,163,184,0.65)]",
    panel: "border-slate-400/35 bg-slate-400/10 text-slate-100",
    icon: Activity
  },
  healthy: {
    label: "GREEN",
    description: "Working normally",
    dot: "bg-emerald-400 shadow-[0_0_20px_rgba(74,222,128,0.9)]",
    panel: "border-emerald-400/35 bg-emerald-400/10 text-emerald-100",
    icon: CheckCircle2
  },
  degraded: {
    label: "AMBER",
    description: "Slow or needs attention",
    dot: "bg-amber-300 shadow-[0_0_20px_rgba(252,211,77,0.9)]",
    panel: "border-amber-300/40 bg-amber-300/10 text-amber-50",
    icon: AlertTriangle
  },
  down: {
    label: "RED",
    description: "Not working / urgent action",
    dot: "animate-pulse bg-red-400 shadow-[0_0_22px_rgba(248,113,113,1)]",
    panel: "border-red-400/45 bg-red-400/10 text-red-50",
    icon: ServerCrash
  }
};

export function LiveMonitoringWallboard() {
  const [snapshot, setSnapshot] = useState<MonitoringSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("/api/admin/monitoring", { cache: "no-store" });
      const result = (await response.json().catch(() => ({}))) as MonitoringSnapshot & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not load live service health.");
      setSnapshot(result);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load live service health.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const incidents = useMemo(() => snapshot?.checks.filter((check) => check.state !== "healthy") || [], [snapshot]);
  const checkedAt = snapshot?.checkedAt ? new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(snapshot.checkedAt)) : "Checking…";

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  }

  const overall: MonitorState = snapshot?.overall || "checking";
  const overallCopy = stateCopy[overall];

  return (
    <main className="min-h-screen bg-[#071018] text-slate-100">
      <div className="min-h-screen bg-[radial-gradient(circle_at_17%_0%,rgba(30,78,105,0.34),transparent_30rem),linear-gradient(rgba(148,163,184,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px)] bg-[size:auto,38px_38px,38px_38px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <span className={`h-3.5 w-3.5 rounded-full ${overallCopy.dot}`} />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Live monitoring</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">FAST FLEETS 360</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300"><Wifi className="h-3.5 w-3.5 text-emerald-300" />Auto-checking every 30 seconds</span>
            <button type="button" onClick={() => void refresh(true)} disabled={refreshing} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-black text-white transition hover:bg-white/15 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
            <button type="button" onClick={() => void toggleFullscreen()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-300/35 bg-emerald-400/15 px-3 text-sm font-black text-emerald-50 transition hover:bg-emerald-400/25"><Expand className="h-4 w-4" />Wall mode</button>
          </div>
        </header>

        {error ? <div className="mx-auto mt-5 max-w-[1800px] rounded-2xl border border-red-400/45 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error} The last successful status remains on screen until the next check.</div> : null}

        <section className="mx-auto mt-6 grid max-w-[1800px] gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/50 p-4 shadow-2xl shadow-black/20 backdrop-blur sm:p-6">
            <div className="mx-auto max-w-md rounded-2xl border border-white/15 bg-slate-900/90 px-5 py-4 text-center shadow-[0_0_40px_rgba(16,185,129,0.12)]">
              <div className="flex items-center justify-center gap-3"><span className={`h-4 w-4 rounded-full ${overallCopy.dot}`} /><span className="text-lg font-black text-white">Platform Core</span></div>
              <p className="mt-1 text-sm font-semibold text-slate-400">{loading ? "Running live checks…" : overallCopy.description}</p>
            </div>
            <div className="mx-auto h-10 w-px bg-gradient-to-b from-emerald-300/80 to-white/20" />
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {monitorGroups.map((group) => {
                const state: MonitorState = snapshot?.groupStates?.[group.id] || "checking";
                const stateInfo = stateCopy[state];
                const children = snapshot?.checks.filter((check) => check.group === group.id) || [];
                return <ServiceBranch key={group.id} group={group} stateInfo={stateInfo} checks={children} loading={loading} />;
              })}
            </div>
          </div>

          <aside className="grid content-start gap-4">
            <section className="rounded-[28px] border border-white/10 bg-slate-900/85 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-300" /><h2 className="font-black text-white">Status lights</h2></div>
              <div className="mt-4 grid gap-3">
                {(["healthy", "degraded", "down"] as ServiceState[]).map((state) => {
                  const info = stateCopy[state];
                  return <div key={state} className={`rounded-2xl border p-3 ${info.panel}`}><div className="flex items-center gap-3"><span className={`h-4 w-4 shrink-0 rounded-full ${info.dot}`} /><div><strong className="text-sm">{info.label}</strong><span className="ml-2 text-sm font-semibold text-white/90">— {info.description}</span></div></div></div>;
                })}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-slate-900/85 p-5 shadow-xl shadow-black/20 backdrop-blur">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-amber-300" /><h2 className="font-black text-white">Needs attention</h2></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-black text-slate-200">{incidents.length}</span></div>
              <div className="mt-4 grid gap-3">
                {incidents.length ? incidents.map((check) => <IncidentCard key={check.id} check={check} />) : <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">All monitored services are responding normally.</div>}
              </div>
            </section>
          </aside>
        </section>

        <footer className="mx-auto mt-6 flex max-w-[1800px] flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs font-bold text-slate-400">
          <span className="inline-flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-emerald-300" />Last check: {checkedAt}</span>
          <span>Read-only operational health checks · Admin access required</span>
        </footer>
      </div>
    </main>
  );
}

function ServiceBranch({ group, stateInfo, checks, loading }: { group: (typeof monitorGroups)[number]; stateInfo: (typeof stateCopy)[MonitorState]; checks: HealthCheck[]; loading: boolean }) {
  return <article className={`rounded-2xl border bg-slate-900/75 p-4 shadow-lg shadow-black/10 ${stateInfo.panel.split(" ")[0]}`}>
    <div className="flex items-start gap-3"><span className={`mt-1 h-4 w-4 shrink-0 rounded-full ${stateInfo.dot}`} /><div><h2 className="font-black text-white">{group.label}</h2><p className="mt-0.5 text-xs font-semibold leading-5 text-slate-400">{group.description}</p></div></div>
    <div className="mt-4 grid gap-2 border-t border-white/10 pt-3">
      {loading && !checks.length ? <span className="text-xs font-bold text-slate-400">Checking live service…</span> : checks.map((check) => <div key={check.id} className="flex items-start justify-between gap-3 rounded-xl bg-black/20 px-3 py-2.5"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stateCopy[check.state].dot}`} /><strong className="text-xs text-slate-100">{check.label}</strong></div><p className="mt-1 pl-[18px] text-[0.68rem] font-semibold leading-4 text-slate-400">{check.detail}</p></div><span className="shrink-0 text-[0.68rem] font-black text-slate-300">{check.durationMs}ms</span></div>)}
    </div>
  </article>;
}

function IncidentCard({ check }: { check: HealthCheck }) {
  const info = stateCopy[check.state];
  return <div className={`rounded-2xl border p-3 ${info.panel}`}><div className="flex items-start gap-3"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${info.dot}`} /><div><strong className="text-sm text-white">{check.label}</strong><p className="mt-1 text-xs font-semibold leading-5 text-white/75">{check.detail}</p><span className="mt-2 block text-[0.68rem] font-black uppercase tracking-wide text-white/60">{check.durationMs}ms · {info.label}</span></div></div></div>;
}
