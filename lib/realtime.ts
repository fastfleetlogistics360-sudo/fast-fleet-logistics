import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Cleanup = () => void;

export function subscribeToDelivery(deliveryId: string, onChange: (payload: unknown) => void): Cleanup {
  const supabase = createClient();
  const channel: RealtimeChannel = supabase
    .channel(`delivery:${deliveryId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "deliveries",
        filter: `id=eq.${deliveryId}`
      },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function subscribeToRiderLocations(zone: string, onChange: (payload: unknown) => void): Cleanup {
  const supabase = createClient();
  const channel: RealtimeChannel = supabase
    .channel(`rider-locations:${zone}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "rider_locations",
        filter: `zone=eq.${zone}`
      },
      onChange
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
