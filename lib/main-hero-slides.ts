export const mainHeroSlidesSettingsKey = "main_hero_slides";
export const mainHeroSlidesStorageKey = "fastfleet_main_hero_slides";

export type MainHeroSlideIcon = "MapPinned" | "Bike" | "Radar" | "ShieldCheck" | "PackageCheck";

export type MainHeroSlide = {
  id: string;
  badgeText: string;
  subtitle: string;
  title: string;
  description: string;
  image: string;
  primaryButtonLabel: string;
  primaryButtonHref: string;
  secondaryButtonLabel: string;
  secondaryButtonHref: string;
  tertiaryButtonLabel: string;
  tertiaryButtonHref: string;
  enabled: boolean;
  icon: MainHeroSlideIcon;
};

export const mainHeroSlideIcons: MainHeroSlideIcon[] = ["MapPinned", "Bike", "Radar", "ShieldCheck", "PackageCheck"];

const allowedIcons = new Set<MainHeroSlideIcon>(mainHeroSlideIcons);

export const defaultMainHeroSlides: MainHeroSlide[] = [
  {
    id: "citywide-delivery",
    badgeText: "Citywide delivery",
    title: "Fast delivery across your city",
    subtitle: "Same-day movement for every urgent city errand.",
    description: "Move food, documents, retail parcels, and urgent packages with riders built for same-day movement.",
    image: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?auto=format&fit=crop&w=1600&q=72",
    primaryButtonLabel: "Book Delivery",
    primaryButtonHref: "/book",
    secondaryButtonLabel: "Track Package",
    secondaryButtonHref: "/track",
    tertiaryButtonLabel: "Become a Rider",
    tertiaryButtonHref: "/auth?account=driver",
    enabled: true,
    icon: "MapPinned"
  },
  {
    id: "instant-rider-booking",
    badgeText: "Instant rider booking",
    title: "Book dispatch riders instantly",
    subtitle: "Fast rider matching for personal and business dispatch.",
    description: "Set pickup and drop-off points, choose your delivery type, and get matched to nearby Fast Fleets 360 riders.",
    image: "https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?auto=format&fit=crop&w=1600&q=72",
    primaryButtonLabel: "Book Delivery",
    primaryButtonHref: "/book",
    secondaryButtonLabel: "Track Package",
    secondaryButtonHref: "/track",
    tertiaryButtonLabel: "Become a Rider",
    tertiaryButtonHref: "/auth?account=driver",
    enabled: true,
    icon: "Bike"
  },
  {
    id: "live-tracking",
    badgeText: "Live tracking",
    title: "Track your delivery live",
    subtitle: "Keep every package visible from pickup to handoff.",
    description: "Follow rider movement, delivery status, and route updates from pickup to safe handoff.",
    image: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1600&q=72",
    primaryButtonLabel: "Track Package",
    primaryButtonHref: "/track",
    secondaryButtonLabel: "Book Delivery",
    secondaryButtonHref: "/book",
    tertiaryButtonLabel: "Become a Rider",
    tertiaryButtonHref: "/auth?account=driver",
    enabled: true,
    icon: "Radar"
  },
  {
    id: "reliable-package-movement",
    badgeText: "Reliable package movement",
    title: "Send packages with confidence",
    subtitle: "Clear pricing, verified riders, and steady updates.",
    description: "Fast Fleets 360 keeps delivery fees clear, riders verified, and customers updated through every step.",
    image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=1600&q=72",
    primaryButtonLabel: "Book Delivery",
    primaryButtonHref: "/book",
    secondaryButtonLabel: "Track Package",
    secondaryButtonHref: "/track",
    tertiaryButtonLabel: "Become a Rider",
    tertiaryButtonHref: "/auth?account=driver",
    enabled: true,
    icon: "ShieldCheck"
  }
];

export function normalizeMainHeroSlides(value: unknown): MainHeroSlide[] {
  if (!Array.isArray(value)) return defaultMainHeroSlides;
  const normalized = value
    .slice(0, 10)
    .map((item, index) => normalizeMainHeroSlide(item, index))
    .filter((slide): slide is MainHeroSlide => Boolean(slide));

  return normalized.length ? normalized : defaultMainHeroSlides;
}

export function enabledMainHeroSlides(value: unknown): MainHeroSlide[] {
  const slides = normalizeMainHeroSlides(value).filter((slide) => slide.enabled);
  return slides.length ? slides : defaultMainHeroSlides;
}

export function createMainHeroSlide(): MainHeroSlide {
  return {
    id: `main-hero-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    badgeText: "New Fast Fleets 360 slide",
    subtitle: "Add a short supporting line for this hero slide.",
    title: "New hero headline",
    description: "Add a clear, customer-facing description for this hero slide.",
    image: defaultMainHeroSlides[0].image,
    primaryButtonLabel: "Book Delivery",
    primaryButtonHref: "/book",
    secondaryButtonLabel: "Track Package",
    secondaryButtonHref: "/track",
    tertiaryButtonLabel: "Become a Rider",
    tertiaryButtonHref: "/auth?account=driver",
    enabled: true,
    icon: "PackageCheck"
  };
}

function normalizeMainHeroSlide(value: unknown, index: number): MainHeroSlide | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<Record<keyof MainHeroSlide, unknown>>;
  const fallback = defaultMainHeroSlides[index % defaultMainHeroSlides.length];
  const id = text(record.id, 80) || fallback.id || `main-hero-${index + 1}`;
  const title = text(record.title, 96) || fallback.title;
  const rawBadgeText = text(record.badgeText, 72);
  const legacySubtitle = text((value as { subtitle?: unknown }).subtitle, 120);
  const badgeText = rawBadgeText || text((value as { eyebrow?: unknown }).eyebrow, 72) || legacySubtitle || fallback.badgeText;
  const subtitle = (rawBadgeText ? legacySubtitle : text((value as { subtext?: unknown }).subtext, 140)) || fallback.subtitle;
  const description = text(record.description, 220) || text((value as { copy?: unknown }).copy, 220) || fallback.description;
  const image = safeAssetUrl(record.image) || fallback.image;
  const primaryButtonLabel = text(record.primaryButtonLabel, 40) || text((value as { buttonLabel?: unknown }).buttonLabel, 40) || fallback.primaryButtonLabel;
  const primaryButtonHref = safeActionHref(record.primaryButtonHref) || safeActionHref((value as { buttonHref?: unknown }).buttonHref) || fallback.primaryButtonHref;
  const secondaryButtonLabel = text(record.secondaryButtonLabel, 40) || fallback.secondaryButtonLabel;
  const secondaryButtonHref = safeActionHref(record.secondaryButtonHref) || fallback.secondaryButtonHref;
  const tertiaryButtonLabel = text(record.tertiaryButtonLabel, 40) || fallback.tertiaryButtonLabel;
  const tertiaryButtonHref = safeActionHref(record.tertiaryButtonHref) || fallback.tertiaryButtonHref;
  const iconValue = text(record.icon, 32) as MainHeroSlideIcon;

  return {
    id,
    badgeText,
    title,
    subtitle,
    description,
    image,
    primaryButtonLabel,
    primaryButtonHref,
    secondaryButtonLabel,
    secondaryButtonHref,
    tertiaryButtonLabel,
    tertiaryButtonHref,
    enabled: record.enabled === undefined ? true : Boolean(record.enabled),
    icon: allowedIcons.has(iconValue) ? iconValue : fallback.icon
  };
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeAssetUrl(value: unknown) {
  const url = text(value, 600);
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return url;
  } catch {
    return "";
  }
  return "";
}

function safeActionHref(value: unknown) {
  const href = text(value, 220);
  if (!href) return "";
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return "";
}
