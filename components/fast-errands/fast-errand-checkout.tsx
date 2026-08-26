"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Store, WalletCards } from "lucide-react";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getShoppingStoreImage, type ShoppingMall } from "@/lib/mall-menu";

export function FastErrandCheckout({ malls }: { malls: ShoppingMall[] }) {
  const vendors = useMemo(() => malls.flatMap((mall) => mall.stores.filter((store) => store.businessId && store.operatingStatus !== "closed").map((store) => ({ mall, store }))), [malls]);
  const [vendorId, setVendorId] = useState(vendors[0]?.store.id || "");
  const [items, setItems] = useState("");
  const [budget, setBudget] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeErrands, setActiveErrands] = useState<Array<{ id: string; errand_code: string; vendor_name: string; status: string; top_up_required_ngn: number }>>([]);
  const selected = vendors.find((vendor) => vendor.store.id === vendorId);

  useEffect(() => {
    fetch("/api/fast-errands", { cache: "no-store" }).then((response) => response.ok ? response.json() : { errands: [] }).then((data) => setActiveErrands(Array.isArray(data.errands) ? data.errands : [])).catch(() => undefined);
  }, []);

  async function payTopUp(errandId: string) {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/fast-errands/top-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ errandId }) });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Could not start the top-up.");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start the top-up."); setLoading(false); }
  }

  async function checkout() {
    setMessage(null);
    setLoading(true);
    try {
      const response = await fetch("/api/fast-errands/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorId, items, purchaseBudgetNgn: Number(budget), address, email, phone }) });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "Could not start FastErrands payment.");
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start FastErrands payment.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <BackButton className="section-wrap pb-4 pt-4" />
    <section className="section-wrap pb-12 pt-2">
      <div className="overflow-hidden rounded-[24px] border border-fleet-line bg-white shadow-lift">
        <div className="grid md:grid-cols-[300px_1fr]">
          <div className="relative h-52 bg-fleet-night md:h-full">
            {selected ? <img src={getShoppingStoreImage(selected.store, selected.mall)} alt={selected.store.name} className="h-full w-full object-cover opacity-75" /> : null}
            <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-black uppercase tracking-[0.13em] text-fleet-ember"><WalletCards className="h-4 w-4" /> FastErrands</span>
          </div>
          <div className="p-5 sm:p-7">
            <h1 className="text-3xl font-black text-fleet-night sm:text-4xl">Buy from a verified store—without asking a rider to pay.</h1>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-600">Your purchase budget is protected until the Fast Fleets team funds the selected vendor. If the final bill is lower, the balance returns to your wallet. If it is higher, you approve the difference first.</p>
            <div className="mt-5 flex flex-wrap gap-2"><StatusBadge tone="green">Verified vendors only</StatusBadge><StatusBadge tone="neutral">No rider cash advance</StatusBadge></div>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-fleet bg-orange-50 text-fleet-ember"><Store className="h-5 w-5" /></span><div><h2 className="font-black text-fleet-night">Your purchase request</h2><p className="text-xs font-bold text-slate-500">Only active, linked shopping vendors appear here.</p></div></div>
          <div className="mt-5 grid gap-4">
            <label className="form-field"><span className="form-label">Verified vendor</span><select className="form-input" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>{vendors.map((vendor) => <option key={vendor.store.id} value={vendor.store.id}>{vendor.store.name} · {vendor.mall.location}</option>)}</select></label>
            <label className="form-field"><span className="form-label">What should we buy?</span><textarea className="form-input min-h-28" value={items} onChange={(event) => setItems(event.target.value)} placeholder="Example: 2 bags of rice, 1 cooking oil, no substitutions without asking me." /></label>
            <label className="form-field"><span className="form-label">Purchase budget (₦)</span><input className="form-input" inputMode="numeric" value={budget} onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))} placeholder="10,000" /></label>
            <AddressAutocompleteInput label="Delivery address" value={address} onChange={setAddress} placeholder="Enter recipient street address" />
            <div className="grid gap-3 sm:grid-cols-2"><input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email for receipt" type="email" /><input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" inputMode="tel" /></div>
          </div>
        </Card>
        <Card className="h-fit p-5 lg:sticky lg:top-24"><ShieldCheck className="h-7 w-7 text-emerald-600" /><h2 className="mt-3 text-xl font-black text-fleet-night">How your money is protected</h2><ol className="mt-4 grid gap-3 text-sm font-semibold leading-6 text-slate-600"><li><b className="text-fleet-night">1.</b> Pay your purchase budget, delivery, and service fee through Squad.</li><li><b className="text-fleet-night">2.</b> We manually fund the verified vendor from Fast Fleets before a rider is released.</li><li><b className="text-fleet-night">3.</b> You approve any extra purchase funds; unused purchase money is returned to your wallet.</li></ol><Button className="mt-6 w-full" onClick={checkout} disabled={loading || !vendors.length}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}Protect purchase budget & pay</Button>{message ? <p className="mt-3 rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{message}</p> : null}</Card>
      </div>
      {activeErrands.length ? <Card className="mt-5 p-5"><h2 className="text-lg font-black text-fleet-night">Your active FastErrands</h2><div className="mt-3 grid gap-3">{activeErrands.map((errand) => <div key={errand.id} className="flex flex-col gap-3 rounded-fleet bg-fleet-paper p-3 sm:flex-row sm:items-center sm:justify-between"><span><strong className="block text-sm font-black text-fleet-night">{errand.errand_code} · {errand.vendor_name}</strong><span className="text-xs font-bold text-slate-500">{errand.status === "top_up_required" ? "The store price changed; your approval is needed." : errand.status.replaceAll("_", " ")}</span></span>{errand.status === "top_up_required" ? <Button size="sm" onClick={() => payTopUp(errand.id)} disabled={loading}>Approve {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(errand.top_up_required_ngn)} top-up</Button> : <StatusBadge tone={errand.status === "vendor_funded" ? "green" : "amber"}>{errand.status.replaceAll("_", " ")}</StatusBadge>}</div>)}</div></Card> : null}
    </section>
  </>;
}
