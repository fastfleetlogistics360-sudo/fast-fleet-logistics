import { redirect } from "next/navigation";
import { MarketplaceOperations } from "@/components/marketplace/marketplace-operations";
import { hasActiveMarketplaceOperatorMembership } from "@/lib/marketplace-operator-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MarketplaceOperationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  if (!user || !admin || !(await hasActiveMarketplaceOperatorMembership(admin, user.id))) redirect("/");
  return <MarketplaceOperations />;
}
