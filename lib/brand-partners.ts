export type BrandPartner = {
  id: string;
  name: string;
  image: string;
  active: boolean;
};

export const defaultBrandPartners: BrandPartner[] = [
  {
    id: "freshmart",
    name: "FreshMart",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=500&q=78",
    active: true
  },
  {
    id: "swiftfoods",
    name: "SwiftFoods",
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=500&q=78",
    active: true
  },
  {
    id: "medilink",
    name: "MediLink",
    image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=500&q=78",
    active: true
  },
  {
    id: "city-bites",
    name: "City Bites",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=78",
    active: true
  },
  {
    id: "parcelpro",
    name: "ParcelPro",
    image: "https://images.unsplash.com/photo-1607082349566-187342175e2f?auto=format&fit=crop&w=500&q=78",
    active: true
  },
  {
    id: "markethub",
    name: "MarketHub",
    image: "https://images.unsplash.com/photo-1515706886582-54c73c5eaf41?auto=format&fit=crop&w=500&q=78",
    active: true
  },
  {
    id: "shop-lagos",
    name: "Shop Lagos",
    image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=500&q=78",
    active: true
  },
  {
    id: "quicksend",
    name: "QuickSend",
    image: "https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=500&q=78",
    active: true
  }
];

export function normalizeBrandPartners(value: unknown) {
  const partners = Array.isArray(value) ? value : defaultBrandPartners;
  return partners
    .slice(0, 24)
    .map((partner, index) => {
      const item = partner as Partial<BrandPartner>;
      const name = String(item.name || "").trim().slice(0, 48);
      const image = String(item.image || "").trim().slice(0, 500);
      return {
        id: String(item.id || slugify(name) || `partner-${index + 1}`).slice(0, 72),
        name,
        image,
        active: item.active !== false
      };
    })
    .filter((partner) => partner.name && isSafeImageUrl(partner.image));
}

function isSafeImageUrl(value: string) {
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
