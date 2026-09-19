import { Skeleton } from "@/components/ui/skeleton";

export default function HubLoading() {
  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[linear-gradient(180deg,#f8fafc,#eef3f8)] pb-24">
      <div className="section-wrap max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
        <section className="flex min-h-[74px] items-center justify-between rounded-[22px] border border-white/80 bg-white/[0.90] px-4 shadow-[0_18px_48px_rgba(8,17,31,0.08)]"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-4 w-32" /></div></div><Skeleton className="h-10 w-20 rounded-[14px]" /></section>
        <Skeleton className="mt-4 h-[196px] w-full rounded-[18px] sm:h-[220px]" />
        <section className="mt-5 rounded-[22px] border border-white/80 bg-white/[0.90] p-4 shadow-[0_18px_48px_rgba(8,17,31,0.08)]"><Skeleton className="h-5 w-28" /><div className="mt-5 grid grid-cols-4 gap-x-3 gap-y-5">{Array.from({ length: 12 }, (_, index) => <div key={index} className="grid place-items-center gap-2"><Skeleton className="h-12 w-12 rounded-[15px]" /><Skeleton className="h-3 w-14" /></div>)}</div></section>
      </div>
    </main>
  );
}
