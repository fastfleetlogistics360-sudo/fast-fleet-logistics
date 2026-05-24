import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "transport-panel smart-card-grid rounded-fleet border border-white/80 bg-white/[0.88] text-fleet-night shadow-[0_12px_30px_rgba(8,17,31,0.1)] ring-1 ring-fleet-line/45 backdrop-blur-2xl transition duration-300 hover:-translate-y-0.5 hover:border-fleet-gold/45 hover:shadow-[0_18px_42px_rgba(8,17,31,0.14)] focus-within:-translate-y-0.5 focus-within:border-fleet-gold/45 focus-within:shadow-[0_18px_42px_rgba(8,17,31,0.14)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0",
        className
      )}
      {...props}
    />
  );
}

export function GlassPanel({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-fleet border border-white/20 bg-white/10 shadow-glow ring-1 ring-white/10 backdrop-blur-2xl transition duration-300 hover:-translate-y-0.5 focus-within:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0",
        className
      )}
      {...props}
    />
  );
}
