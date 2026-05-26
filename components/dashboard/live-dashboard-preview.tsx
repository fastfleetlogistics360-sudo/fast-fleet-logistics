import { Activity, Bike, CreditCard, PackageCheck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

export function LiveDashboardPreview() {
  return (
    <div className="rounded-fleet border border-white/20 bg-white/10 p-3 shadow-glow backdrop-blur-2xl">
      <div className="rounded-fleet bg-white p-4 text-fleet-night shadow-lift">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Ops console</span>
            <strong className="mt-1 block text-xl font-black">FAST FLEETS360 Live</strong>
          </div>
          <StatusBadge tone="green">Realtime</StatusBadge>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {([
            ["Active jobs", "284", PackageCheck],
            ["Online riders", "91", Bike],
            ["Wallet volume", "NGN 18.6m", Wallet],
            ["Success rate", "98.2%", Activity]
          ] as Array<[string, string, LucideIcon]>).map(([label, value, Icon]) => (
            <div key={label as string} className="rounded-fleet border border-fleet-line bg-fleet-paper p-3">
              <Icon className="h-4 w-4 text-fleet-ember" />
              <strong className="mt-2 block text-lg font-black">{value as string}</strong>
              <span className="text-xs font-bold text-slate-500">{label as string}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-fleet border border-fleet-line p-3">
          <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            <span>Dispatch queue</span>
            <span>ETA</span>
          </div>
          <div className="mt-3 grid gap-3">
            {[
              ["FF-24091", "Lekki", "Ikeja", "12m", "accepted"],
              ["FF-24092", "Ota", "Abeokuta", "28m", "searching"],
              ["FF-24093", "VI", "Surulere", "19m", "picked up"]
            ].map((row) => (
              <div key={row[0]} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-fleet bg-white p-2 shadow-[0_8px_18px_rgba(8,17,31,0.05)]">
                <span className="grid h-9 w-9 place-items-center rounded-fleet bg-fleet-night text-white">
                  <CreditCard className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm font-black">{row[0]}</strong>
                  <span className="block truncate text-xs font-semibold text-slate-500">
                    {row[1]} to {row[2]} / {row[4]}
                  </span>
                </span>
                <strong className="text-sm font-black text-fleet-ember">{row[3]}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
