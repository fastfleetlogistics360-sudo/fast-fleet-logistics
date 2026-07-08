"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Star, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

type ReviewSubject = {
  reviewerRole: "customer" | "rider" | "business";
  subjectType: "customer_delivery" | "rider_delivery" | "business_order";
  deliveryId?: string | null;
  orderId?: string | null;
  targetUserId?: string | null;
  targetProfileId?: string | null;
  targetRiderProfileId?: string | null;
  targetBusinessProfileId?: string | null;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
};

type ReviewPromptProps = {
  subject: ReviewSubject | null;
};

function subjectId(subject: ReviewSubject) {
  return subject.orderId || subject.deliveryId || "";
}

function storageKey(subject: ReviewSubject) {
  return `fastfleet-review:${subject.reviewerRole}:${subject.subjectType}:${subjectId(subject)}`;
}

export function ReviewPrompt({ subject }: ReviewPromptProps) {
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState(0);
  const [improvementNote, setImprovementNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const key = useMemo(() => (subject ? storageKey(subject) : ""), [subject]);
  const needsImprovementNote = rating > 0 && rating <= 3;

  useEffect(() => {
    if (!subject || !subjectId(subject)) return;
    const currentSubject = subject;
    let cancelled = false;
    async function checkReview() {
      setChecking(true);
      setError(null);
      try {
        if (window.localStorage.getItem(key) || window.sessionStorage.getItem(`${key}:later`)) return;
        const params = new URLSearchParams({ subjectType: currentSubject.subjectType });
        if (currentSubject.orderId) params.set("orderId", currentSubject.orderId);
        if (currentSubject.deliveryId) params.set("deliveryId", currentSubject.deliveryId);
        const response = await fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { exists?: boolean };
        if (!cancelled && response.ok && !payload.exists) setVisible(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void checkReview();
    return () => {
      cancelled = true;
    };
  }, [key, subject]);

  async function submitReview() {
    if (!subject || rating < 1 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerRole: subject.reviewerRole,
          subjectType: subject.subjectType,
          deliveryId: subject.deliveryId,
          orderId: subject.orderId,
          targetUserId: subject.targetUserId,
          targetProfileId: subject.targetProfileId,
          targetRiderProfileId: subject.targetRiderProfileId,
          targetBusinessProfileId: subject.targetBusinessProfileId,
          rating,
          improvementNote,
          metadata: subject.metadata || {}
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save your review.");
      window.localStorage.setItem(key, "submitted");
      setVisible(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save your review.");
    } finally {
      setSaving(false);
    }
  }

  function closeForNow() {
    if (key) window.sessionStorage.setItem(`${key}:later`, "true");
    setVisible(false);
  }

  if (!subject || checking || !visible) return null;

  return (
    <div className="fixed inset-0 z-[140] grid place-items-end bg-fleet-night/45 p-3 sm:place-items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[22px] bg-white p-5 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Quick review</span>
            <h2 className="mt-2 text-2xl font-black leading-tight text-fleet-night">{subject.title}</h2>
            {subject.body ? <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{subject.body}</p> : null}
          </div>
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-fleet-paper text-fleet-night" aria-label="Close review prompt" onClick={closeForNow}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex justify-center gap-2" aria-label="Choose review rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={cn("grid h-12 w-12 place-items-center rounded-[16px] border transition", rating >= value ? "border-fleet-gold bg-amber-50 text-fleet-ember" : "border-fleet-line bg-white text-slate-300 hover:border-fleet-gold")}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              onClick={() => setRating(value)}
            >
              <Star className={cn("h-6 w-6", rating >= value ? "fill-current" : "")} />
            </button>
          ))}
        </div>

        {needsImprovementNote ? (
          <label className="form-field mt-5">
            <span className="form-label">How can we improve?</span>
            <textarea className="form-textarea min-h-24" value={improvementNote} onChange={(event) => setImprovementNote(event.target.value)} placeholder="Tell us what would make this better." />
          </label>
        ) : null}

        {error ? <div className="mt-4 rounded-fleet bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button type="button" variant="secondary" onClick={closeForNow} disabled={saving}>
            Later
          </Button>
          <Button type="button" onClick={submitReview} disabled={rating < 1 || saving} className="bg-fleet-navy hover:bg-fleet-night">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
            Save review
          </Button>
        </div>
      </div>
    </div>
  );
}
