import { LinkButton } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <section className="section-wrap grid min-h-[64vh] place-items-center py-16">
      <div className="max-w-xl rounded-fleet border border-fleet-line bg-white p-8 text-center shadow-lift">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Offline mode</span>
        <h1 className="mt-3 text-3xl font-black text-fleet-night sm:text-5xl">FastFleet is waiting for a connection.</h1>
        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
          Your installed app shell is available. Reconnect to sync orders, rider locations, notifications, wallets, and tracking updates.
        </p>
        <div className="mt-6 flex justify-center">
          <LinkButton href="/" variant="dark">
            Return home
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
