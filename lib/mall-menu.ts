export const mallCategories = ["Grocery", "Pharmacy", "Fashion"] as const;

export type MallCategory = (typeof mallCategories)[number];
export type MallProductPrice = number | null | "ASK_PRICE";

export type MallProduct = {
  id: string;
  businessId?: string;
  name: string;
  price: MallProductPrice;
  image: string;
  available: boolean;
};

export type MallStore = {
  id: string;
  businessId?: string;
  name: string;
  image?: string;
  category: MallCategory;
  products: MallProduct[];
};

export type ShoppingMall = {
  id: string;
  name: string;
  location: string;
  image: string;
  stores: MallStore[];
};

export type ShoppingCategoryVendor = {
  mall: ShoppingMall;
  store: MallStore;
};

export type ShoppingCategoryGroup = {
  category: MallCategory;
  vendors: ShoppingCategoryVendor[];
  productCount: number;
  image: string;
  locations: string[];
};

export const mallMenuSettingsKey = "shopping_malls";
export const mallMenuStorageKey = "fastfleet_shopping_malls";

export const defaultShoppingMalls: ShoppingMall[] = [
  {
    id: "ikeja-city-mall",
    name: "Ikeja Shopping Hub",
    location: "Ikeja, Lagos",
    image: "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?auto=format&fit=crop&w=1200&q=70",
    stores: [
      {
        id: "market-square-ikeja",
        name: "Market Square",
        category: "Grocery",
        products: [
          { id: "rice-5kg-market-square", name: "Rice 5kg", price: 18500, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "cooking-oil-market-square", name: "Cooking Oil 3L", price: 9800, image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      },
      {
        id: "healthplus-ikeja",
        name: "HealthPlus",
        category: "Pharmacy",
        products: [
          { id: "vitamin-c-healthplus", name: "Vitamin C", price: 3500, image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "digital-thermometer-healthplus", name: "Digital Thermometer", price: "ASK_PRICE", image: "https://images.unsplash.com/photo-1584362917165-526a968579e8?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      },
      {
        id: "fashion-store-ikeja",
        name: "Fashion Store",
        category: "Fashion",
        products: [
          { id: "mens-shirt-fashion-store", name: "Men's Shirt", price: 12000, image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "mens-shirt-premium-fashion-store", name: "Men's Shirt", price: 18000, image: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      }
    ]
  },
  {
    id: "palms-shopping-mall",
    name: "Lekki Shopping Hub",
    location: "Lekki, Lagos",
    image: "https://images.unsplash.com/photo-1567958451986-2de427a4a0be?auto=format&fit=crop&w=1200&q=70",
    stores: [
      {
        id: "shoprite-palms",
        name: "Shoprite",
        category: "Grocery",
        products: [
          { id: "rice-5kg-shoprite-palms", name: "Rice 5kg", price: 19800, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "breakfast-bundle-shoprite-palms", name: "Breakfast Bundle", price: 14500, image: "https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      },
      {
        id: "medplus-palms",
        name: "Medplus",
        category: "Pharmacy",
        products: [
          { id: "first-aid-kit-medplus-palms", name: "First Aid Kit", price: 16500, image: "https://images.unsplash.com/photo-1603398938378-e54eab446dde?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "baby-care-pack-medplus-palms", name: "Baby Care Pack", price: null, image: "https://images.unsplash.com/photo-1546015720-b8b30df5aa27?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      },
      {
        id: "style-rack-palms",
        name: "StyleRack Boutique",
        category: "Fashion",
        products: [
          { id: "ankara-dress-style-rack-palms", name: "Ankara Dress", price: 32000, image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "handbag-style-rack-palms", name: "Handbag", price: 24500, image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      }
    ]
  },
  {
    id: "circle-mall",
    name: "Jakande Shopping Hub",
    location: "Jakande, Lagos",
    image: "https://images.unsplash.com/photo-1481437156560-3205f6a55735?auto=format&fit=crop&w=1200&q=70",
    stores: [
      {
        id: "spar-circle",
        name: "SPAR",
        category: "Grocery",
        products: [
          { id: "fruit-crate-spar-circle", name: "Fruit Crate", price: 7800, image: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "cleaning-essentials-spar-circle", name: "Cleaning Essentials", price: 8900, image: "https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      },
      {
        id: "careplus-circle",
        name: "CarePlus Pharmacy",
        category: "Pharmacy",
        products: [
          { id: "sanitizer-pack-careplus-circle", name: "Sanitizer Pack", price: 5400, image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "blood-pressure-monitor-careplus-circle", name: "Blood Pressure Monitor", price: 32500, image: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      },
      {
        id: "sneaker-lane-circle",
        name: "Sneaker Lane",
        category: "Fashion",
        products: [
          { id: "daily-sneakers-sneaker-lane-circle", name: "Daily Sneakers", price: 42000, image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "sports-socks-sneaker-lane-circle", name: "Sports Socks", price: 5200, image: "https://images.unsplash.com/photo-1586350977771-b3b0abd50c82?auto=format&fit=crop&w=600&q=70", available: true }
        ]
      }
    ]
  }
];

export function normalizeShoppingMalls(value: unknown): ShoppingMall[] {
  if (!Array.isArray(value)) return defaultShoppingMalls;

  const malls = value
    .map((entry, mallIndex) => {
      const mall = entry as Partial<ShoppingMall>;
      const fallback = defaultShoppingMalls[mallIndex] || defaultShoppingMalls[0];
      const name = text(mall.name) || fallback.name;
      const stores = Array.isArray(mall.stores) ? mall.stores.map(normalizeMallStore).filter(Boolean) : [];

      return {
        id: text(mall.id) || slug(name),
        name,
        location: text(mall.location) || fallback.location,
        image: text(mall.image) || fallback.image,
        stores: stores.length ? (stores as MallStore[]) : fallback.stores
      };
    })
    .filter((mall) => mall.name && mall.stores.length);

  return malls.length ? malls : defaultShoppingMalls;
}

export function buildShoppingCategoryGroups(malls: ShoppingMall[]): ShoppingCategoryGroup[] {
  const sourceMalls = malls.length ? malls : defaultShoppingMalls;

  return mallCategories
    .map((category) => {
      const vendors = sourceMalls.flatMap((mall) =>
        mall.stores
          .filter((store) => store.category === category)
          .map((store) => ({ mall, store }))
      );
      const productCount = vendors.reduce((count, vendor) => count + vendor.store.products.length, 0);
      const firstVendor = vendors[0];
      const locations = Array.from(new Set(vendors.map(({ mall }) => mall.location).filter(Boolean)));

      return {
        category,
        vendors,
        productCount,
        image: firstVendor ? getShoppingStoreImage(firstVendor.store, firstVendor.mall) : defaultShoppingMalls[0].image,
        locations
      };
    })
    .filter((group) => group.vendors.length);
}

export function getShoppingStoreImage(store: MallStore, mall: ShoppingMall) {
  return text(store.image)
    || text(store.products.find((product) => text(product.image))?.image)
    || text(mall.image)
    || defaultShoppingMalls[0].image;
}

function normalizeMallStore(value: unknown): MallStore | null {
  const store = value as Partial<MallStore>;
  const name = text(store.name);
  if (!name) return null;
  const category = normalizeCategory(store.category);
  const products = Array.isArray(store.products) ? store.products.map(normalizeMallProduct).filter(Boolean) : [];
  return {
    id: text(store.id) || slug(name),
    businessId: text(store.businessId) || undefined,
    name,
    image: text(store.image) || undefined,
    category,
    products: products.length ? (products as MallProduct[]) : []
  };
}

function normalizeMallProduct(value: unknown): MallProduct | null {
  const product = value as Partial<MallProduct>;
  const name = text(product.name);
  if (!name) return null;
  return {
    id: text(product.id) || slug(name),
    businessId: text(product.businessId) || undefined,
    name,
    price: normalizePrice(product.price),
    image: text(product.image) || defaultShoppingMalls[0].stores[0].products[0].image,
    available: product.available !== false
  };
}

function normalizeCategory(value: unknown): MallCategory {
  return mallCategories.includes(value as MallCategory) ? (value as MallCategory) : "Grocery";
}

function normalizePrice(value: unknown): MallProductPrice {
  if (value === null || value === "ASK_PRICE") return value;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? Math.round(price) : "ASK_PRICE";
}

export function slug(value: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || `item-${Date.now()}`;
}

function text(value: unknown) {
  return String(value || "").trim();
}
