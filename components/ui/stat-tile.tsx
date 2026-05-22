import { cn } from "@/lib/cn";

export function StatTile({
  label,
  value,
  helper,
  className
}: {
  label: string;
  value: string;
  helper?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-fleet border border-fleet-line/70 bg-white p-4 shadow-[0_14px_30px_rgba(8,17,31,0.06)]", className)}>
      <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">{label}</span>
      <strong className="mt-2 block break-words text-2xl font-black text-fleet-night sm:text-3xl">{value}</strong>
      {helper ? <span className="mt-1 block text-sm font-semibold text-slate-500">{helper}</span> : null}
    </div>
  );
}
