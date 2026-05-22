import type { ReactNode } from "react";
import { PackageOpen } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export function DashboardEmptyState({
  title,
  body,
  ctaLabel,
  ctaHref,
  icon
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  icon?: ReactNode;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-fleet border border-dashed border-fleet-line bg-fleet-paper p-6 text-center">
      <div>
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-fleet-navy shadow-lift">
          {icon || <PackageOpen className="h-7 w-7" />}
        </span>
        <h3 className="mt-4 text-lg font-black text-fleet-night">{title}</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-600">{body}</p>
        <LinkButton href={ctaHref} className="mt-5">
          {ctaLabel}
        </LinkButton>
      </div>
    </div>
  );
}
