import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChooseAccountTypeForm } from "@/components/auth/choose-account-type-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Choose Account Type"
};

export default async function ChooseAccountTypePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth?returnTo=/choose-account-type");

  return (
    <section className="section-wrap py-8 sm:py-12">
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-5xl" />}>
        <ChooseAccountTypeForm />
      </Suspense>
    </section>
  );
}

