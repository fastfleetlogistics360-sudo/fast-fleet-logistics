import Image from "next/image";
import { cn } from "@/lib/cn";

/** The approved Fast Fleets 360 rendered FAST AI mascot. */
export function FastAiMascot({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("relative block shrink-0 overflow-hidden rounded-full bg-white shadow-[0_9px_18px_rgba(8,17,31,.18)]", priority ? "animate-[fast-ai-arrive_.35s_ease-out_both]" : "", className)}>
      <Image src="/fast-ai/fast-ai-mascot.jpg" alt="" fill priority={priority} sizes="64px" className="object-cover object-[50%_25%]" />
    </span>
  );
}
