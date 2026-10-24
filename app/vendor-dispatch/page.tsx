import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VendorDispatchLogbook } from "@/components/vendor-dispatch/vendor-dispatch-logbook";

export default async function VendorDispatchPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?returnTo=/vendor-dispatch&account=business");
  return <VendorDispatchLogbook />;
}
