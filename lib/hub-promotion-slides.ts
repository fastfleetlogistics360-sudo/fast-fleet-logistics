export const hubPromotionSlidesSettingsKey = "hub_promotion_slides";
export const hubPromotionSlidesStorageKey = "fastfleet_hub_promotion_slides";

export type HubPromotionSlide = {
  id: string;
  badgeText: string;
  title: string;
  description: string;
  image: string;
  href: string;
  enabled: boolean;
};

export const defaultHubPromotionSlides: HubPromotionSlide[] = [
  {
    id: "more-delivery-options",
    badgeText: "New on Fast Fleets",
    title: "More delivery options. More convenience.",
    description: "Explore our growing network of services and partners.",
    image: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=contain&w=1000&q=82",
    href: "/services",
    enabled: true
  },
  {
    id: "marketplace-onboarding",
    badgeText: "Marketplace onboarding",
    title: "Discover new local partners.",
    description: "See marketplace updates, partner openings, and launch opportunities.",
    image: "https://images.unsplash.com/photo-1586880244406-556ebe35f282?auto=format&fit=contain&w=1000&q=82",
    href: "/updates",
    enabled: true
  }
];

export function normalizeHubPromotionSlides(value: unknown): HubPromotionSlide[] {
  if (!Array.isArray(value)) return defaultHubPromotionSlides;

  const slides = value
    .slice(0, 10)
    .map((item, index) => normalizeHubPromotionSlide(item, index))
    .filter((slide): slide is HubPromotionSlide => Boolean(slide));

  return slides.length ? slides : defaultHubPromotionSlides;
}

export function enabledHubPromotionSlides(value: unknown): HubPromotionSlide[] {
  return normalizeHubPromotionSlides(value).filter((slide) => slide.enabled);
}

export function createHubPromotionSlide(): HubPromotionSlide {
  return {
    id: `hub-promotion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    badgeText: "New on Fast Fleets",
    title: "New Hub promotion",
    description: "Add a short customer-facing promotion message.",
    image: defaultHubPromotionSlides[0].image,
    href: "/services",
    enabled: true
  };
}

function normalizeHubPromotionSlide(value: unknown, index: number): HubPromotionSlide | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Partial<Record<keyof HubPromotionSlide, unknown>>;
  const fallback = defaultHubPromotionSlides[index % defaultHubPromotionSlides.length];
  const title = text(record.title, 96) || fallback.title;

  return {
    id: text(record.id, 80) || `hub-promotion-${index + 1}`,
    badgeText: text(record.badgeText, 72) || text((value as { label?: unknown }).label, 72) || fallback.badgeText,
    title,
    description: text(record.description, 180) || text((value as { subtext?: unknown }).subtext, 180) || fallback.description,
    image: safeAssetUrl(record.image),
    href: safeActionHref(record.href) || safeActionHref((value as { ctaHref?: unknown }).ctaHref) || fallback.href,
    enabled: record.enabled === undefined ? true : Boolean(record.enabled)
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
