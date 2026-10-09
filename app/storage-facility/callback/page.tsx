"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { closeSecureCheckout } from "@/lib/payments/open-secure-checkout";

export default function StorageCallback() {
  const search = useSearchParams();
  const [message, setMessage] = useState("Confirming your storage payment…");
  const [done, setDone] = useState(false);

  useEffect(() => {
    void closeSecureCheckout();
    const reference = search.get("reference");
    if (!reference) { setMessage("Missing payment reference."); return; }

    const params = new URLSearchParams({ reference, booking: search.get("booking") || "" });
    const paymentReturnToken = search.get("paymentReturnToken");
    if (paymentReturnToken) params.set("paymentReturnToken", paymentReturnToken);

    fetch(`/api/storage-facility/verify?${params.toString()}`)
      .then(async (response) => ({ ok: response.ok, status: response.status, data: await response.json() }))
      .then(({ ok, status, data }) => {
        if (status === 202) setMessage(data.message);
        else if (ok) { setDone(true); setMessage("Storage Booking Confirmed. You can track it from your bookings."); }
        else setMessage(data.error || "Payment needs attention.");
      })
      .catch(() => setMessage("Payment verification could not be completed."));
  }, [search]);

  return <section className="section-wrap grid min-h-[60vh] place-items-center"><Card className="max-w-lg p-7 text-center"><h1 className="text-3xl font-black text-fleet-night">{done ? "Storage Booking Confirmed" : "Storage payment"}</h1><p className="mt-3 text-sm font-semibold text-slate-600">{message}</p><div className="mt-6 flex justify-center gap-2"><LinkButton href="/storage-facility">Storage bookings</LinkButton><LinkButton href="/hub" variant="secondary">Hub</LinkButton></div></Card></section>;
}
