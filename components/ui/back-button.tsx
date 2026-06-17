"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

type BackButtonProps = {
  className?: string;
  label?: string;
};

export function BackButton({ className, label = "Back" }: BackButtonProps) {
  const router = useRouter();

  return (
    <div className={cn("pointer-events-none sticky top-3 z-[70]", className)}>
      <button
        type="button"
        aria-label={label}
        onClick={() => router.back()}
        className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-fleet border border-fleet-line bg-white/95 px-3 text-sm font-black text-fleet-night shadow-lift backdrop-blur-xl transition hover:border-fleet-gold hover:text-fleet-ember focus:outline-none focus:ring-2 focus:ring-fleet-gold/60"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </button>
    </div>
  );
}
