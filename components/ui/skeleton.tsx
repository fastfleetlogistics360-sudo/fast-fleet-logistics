import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-fleet bg-[linear-gradient(90deg,#edf2f7_25%,#f8fafc_50%,#edf2f7_75%)] bg-[length:200%_100%]",
        className
      )}
    />
  );
}
