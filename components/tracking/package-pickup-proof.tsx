"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import {
  type PickupProof,
  isCustomerPickupProofRequired,
  pickupProofFromMetadata,
  pickupProofReviewExpired,
  pickupProofReviewSecondsRemaining,
  pickupProofStatusMessage
} from "@/lib/pickup-proof";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

type PackagePickupProofProps = {
  deliveryId?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
  className?: string;
  readonly?: boolean;
  onProofChange?: (proof: PickupProof) => void;
};

export function PackagePickupProof({ deliveryId, metadata, status, className, readonly = false, onProofChange }: PackagePickupProofProps) {
  const [proof, setProof] = useState<PickupProof | null>(() => pickupProofFromMetadata(metadata));
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const proofRequired = isCustomerPickupProofRequired(metadata);
  const activeStatus = String(status || "");
  const shouldShow = proofRequired && (Boolean(proof?.url) || ["picked_up", "in_transit", "awaiting_delivery_confirmation", "delivered"].includes(activeStatus));
  const secondsRemaining = pickupProofReviewSecondsRemaining(proof);
  const canReview = Boolean(!readonly && deliveryId && proof?.url && proof.status === "pending" && !pickupProofReviewExpired(proof));

  useEffect(() => {
    setProof(pickupProofFromMetadata(metadata));
  }, [metadata]);

  const statusTone = useMemo(() => {
    if (proof?.status === "approved" || proof?.status === "auto_approved") return "green";
    if (proof?.status === "rejected") return "red";
    return "amber";
  }, [proof?.status]);

  if (!shouldShow) return null;

  async function review(decision: "approve" | "reject") {
    if (!deliveryId) return;
    setBusy(decision);
    setMessage(null);
    try {
      const response = await fetch("/api/customer/pickup-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId, decision })
      });
      const payload = (await response.json().catch(() => ({}))) as { pickup_proof?: PickupProof; error?: string };
      if (!response.ok || !payload.pickup_proof) throw new Error(payload.error || "Could not confirm package photo.");
      setProof(payload.pickup_proof);
      onProofChange?.(payload.pickup_proof);
      setMessage(decision === "approve" ? "Package confirmed." : payload.pickup_proof.can_continue ? "Dispute recorded. Support review has been flagged." : "Rider has been asked to upload another photo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not confirm package photo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("rounded-fleet border border-fleet-line bg-white p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">FastConfirm™</span>
          <h3 className="mt-1 text-lg font-black text-fleet-night">Check the pickup photo</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            {pickupProofStatusMessage(proof)} {proof?.status === "pending" && secondsRemaining ? `Auto-confirmation in ${Math.ceil(secondsRemaining / 60)} min.` : ""}
          </p>
        </div>
        <StatusBadge tone={statusTone}>{proof?.status ? proof.status.replaceAll("_", " ") : "Waiting"}</StatusBadge>
      </div>

      {proof?.url ? (
        <Image src={proof.url} alt="Package pickup proof" width={720} height={420} unoptimized className="mt-4 max-h-72 w-full rounded-fleet object-cover" />
      ) : (
        <div className="mt-4 rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-600">The rider has not uploaded the package photo yet.</div>
      )}

      {canReview ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" disabled={Boolean(busy)} onClick={() => review("approve")}>
            {busy === "approve" ? "Confirming..." : "Yes, this is my package"}
          </Button>
          <Button type="button" variant="destructive" disabled={Boolean(busy)} onClick={() => review("reject")}>
            {busy === "reject" ? "Sending..." : "No, this is not my package"}
          </Button>
        </div>
      ) : null}

      {message ? <div className="mt-3 rounded-fleet bg-fleet-paper p-3 text-xs font-bold leading-5 text-slate-600">{message}</div> : null}
    </div>
  );
}
