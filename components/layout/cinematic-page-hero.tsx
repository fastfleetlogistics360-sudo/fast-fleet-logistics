import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type CinematicPageHeroProps = {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  children?: ReactNode;
  className?: string;
};

const heroBlurDataURL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nOScgdmlld0JveD0nMCAwIDE2IDknIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zyc+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzknIGZpbGw9JyMwODExMWYnLz48Y2lyY2xlIGN4PScxMicgY3k9JzInIHI9JzUnIGZpbGw9JyNlZjZjMDAnIG9wYWNpdHk9Jy4yOCcvPjwvc3ZnPg==";

export function CinematicPageHero({ eyebrow, title, body, image, children, className }: CinematicPageHeroProps) {
  return (
    <section className={cn("cinematic-hero relative isolate overflow-hidden text-white", className)}>
      <Image src={image} alt="" fill sizes="100vw" quality={68} loading="lazy" placeholder="blur" blurDataURL={heroBlurDataURL} className="absolute inset-0 object-cover object-center" aria-hidden="true" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,17,31,0.96),rgba(8,17,31,0.78)_52%,rgba(8,17,31,0.44)),linear-gradient(180deg,rgba(8,17,31,0.12),rgba(8,17,31,0.88))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(244,166,42,0.16),transparent_28%)]" />
      <div className="section-wrap relative z-10 grid min-h-[230px] content-end py-7 sm:min-h-[280px] sm:py-8">
        <div className="max-w-4xl">
          <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.64rem] font-black uppercase tracking-[0.16em] text-fleet-gold backdrop-blur-xl">
            {eyebrow}
          </span>
          <h1 className="mt-3 max-w-4xl text-3xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/[0.88] drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:text-base">{body}</p>
          {children ? <div className="mt-5">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
