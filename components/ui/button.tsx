import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "dark" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
};

type LinkButtonProps = ComponentPropsWithoutRef<typeof Link> & {
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

const variants = {
  primary: "border-transparent bg-fleet-ember text-white shadow-[0_12px_26px_rgba(239,108,0,0.20)] hover:bg-[#f47e18] hover:shadow-[0_16px_34px_rgba(239,108,0,0.26)]",
  secondary: "border-white/80 bg-white/90 text-fleet-night shadow-[0_10px_24px_rgba(8,17,31,0.07)] backdrop-blur-xl hover:border-fleet-gold hover:bg-white",
  ghost: "border-transparent bg-transparent text-fleet-night hover:bg-fleet-paper",
  dark: "border-white/10 bg-fleet-night text-white shadow-[0_12px_28px_rgba(8,17,31,0.18)] hover:bg-[#10233a]",
  destructive: "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100"
};

const sizes = {
  sm: "min-h-8 px-3 text-xs",
  md: "min-h-10 px-3.5 text-[0.84rem]",
  lg: "min-h-11 px-4 text-sm",
  icon: "h-9 w-9 p-0"
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[14px] border font-extrabold transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-fleet-gold/20 disabled:pointer-events-none disabled:opacity-55",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

export function LinkButton({ className, variant = "primary", size = "md", ...props }: LinkButtonProps) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[14px] border font-extrabold transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-fleet-gold/20",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
