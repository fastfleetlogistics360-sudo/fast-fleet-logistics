import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-fleet border border-fleet-line/80 bg-white shadow-[0_18px_48px_rgba(8,17,31,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-lift focus-within:-translate-y-1 focus-within:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0",
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
        "rounded-fleet border border-white/20 bg-white/10 shadow-glow backdrop-blur-2xl transition duration-300 hover:-translate-y-1 focus-within:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0",
        className
      )}
      {...props}
    />
  );
}
