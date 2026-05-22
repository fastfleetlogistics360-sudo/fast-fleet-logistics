"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AccountDeletionButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirmation === "DELETE";

  async function deleteAccount() {
    if (!confirmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session has expired. Sign in again to delete your account.");

      const deletedAt = new Date().toISOString();
      await Promise.allSettled([
        supabase.from("profiles").update({ deleted_at: deletedAt, email: null, phone: null, full_name: "Deleted user" }).eq("user_id", user.id),
        supabase.from("users").update({ email: null, phone: null, full_name: "Deleted user", updated_at: deletedAt }).eq("id", user.id),
        supabase.from("account_deletion_requests").insert({ user_id: user.id, requested_at: deletedAt, status: "queued" })
      ]);
      await supabase.auth.signOut();
      window.location.assign("/auth");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete your account right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" className={className || "w-full border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-50"} onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Delete my account
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[130] grid place-items-end bg-fleet-night/40 p-3 sm:place-items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-fleet bg-white p-5 shadow-glow">
            <div className="flex items-start justify-between gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-fleet bg-red-50 text-red-700">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-paper text-fleet-night" aria-label="Close delete account modal" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <h2 className="mt-4 text-2xl font-black text-fleet-night">Delete my account</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              This immediately anonymizes your profile, signs you out, and queues eligible account data for permanent deletion after the retention window. Operational records such as payments, deliveries, and support history may be retained where legally required. Type DELETE to confirm.
            </p>
            <label className="form-field mt-5">
              <span className="form-label">Confirmation</span>
              <input className="form-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="DELETE" />
            </label>
            {error ? <div className="mt-3 rounded-fleet bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Button type="button" variant="secondary" disabled={loading} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={!confirmed || loading} onClick={deleteAccount} className="bg-red-600 hover:bg-red-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirm deletion
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
