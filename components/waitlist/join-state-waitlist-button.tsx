"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function JoinStateWaitlistButton({
  state,
  email,
  phone
}: {
  state: string;
  email?: string | null;
  phone?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function joinWaitlist() {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      await supabase.from("state_waitlist").upsert(
        {
          user_id: user?.id || null,
          email: email || user?.email || "",
          phone: phone || user?.phone || null,
          state,
          source: "dashboard"
        },
        { onConflict: "email,state" }
      );
    } catch {
      const stored = JSON.parse(localStorage.getItem("fastfleet.state.waitlist") || "[]");
      localStorage.setItem(
        "fastfleet.state.waitlist",
        JSON.stringify([{ state, email, phone, joined_at: new Date().toISOString() }, ...stored])
      );
    } finally {
      router.push(`/waitlist/thank-you?state=${encodeURIComponent(state)}`);
    }
  }

  return (
    <Button type="button" onClick={joinWaitlist} disabled={loading} size="lg" className="w-full sm:w-auto">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
      Get notified when we launch in your state
    </Button>
  );
}
