import { NIGERIAN_STATES, normalizeState } from "@/lib/launch-states";

export const mallCategories = ["Grocery", "Pharmacy", "Fashion", "Electronics", "Gadgets"] as const;

export type MallCategory = (typeof mallCategories)[number];
export type MallProductPrice = number | null | "ASK_PRICE";

export type MallProduct = {
  id: string;
  businessId?: string;
  name: string;
  /** A vendor-owned product type used to organize this vendor's storefront. */
  type?: string;
  price: MallProductPrice;
  image: string;
  available: boolean;
  /** Optional branch-specific prices. An omitted state uses the shared price. */
  statePrices?: Record<string, MallProductPrice>;
};

export type MallStoreLocation = {
  state: string;
  pickupAddress?: string;
  pickupPlaceId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupNote?: string;
  /** Consistent branches inherit every product's shared price. */
  priceMode?: "consistent" | "custom";
};

export type MallStore = {
  id: string;
  businessId?: string;
  name: string;
  image?: string;
  operatingStatus?: "open" | "closed";
  /** States where this verified vendor can receive Fast Fleets 360 marketplace orders. */
  operatingStates?: string[];
  /** A separate fulfilment branch for every state where this vendor trades. */
  locations?: MallStoreLocation[];
  category: MallCategory;
  pickupAddress?: string;
  pickupPlaceId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupNote?: string;
  campusZoneId?: string;
  /** Types are configured independently by each shopping vendor. */
  productTypes?: string[];
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
  location: MallStoreLocation;
};

export type ShoppingCategoryGroup = {
  category: MallCategory;
  vendors: ShoppingCategoryVendor[];
  productCount: number;
  image: string;
  locations: string[];
};

export type ShoppingCategoryMeta = {
  category: MallCategory;
  slug: string;
  label: string;
  eyebrow: string;
  body: string;
  image: string;
};

export const mallMenuSettingsKey = "shopping_malls";
export const mallMenuStorageKey = "fastfleet_shopping_malls";

export const shoppingCategoryMeta: Record<MallCategory, ShoppingCategoryMeta> = {
  Grocery: {
    category: "Grocery",
    slug: "grocery",
    label: "Grocery",
    eyebrow: "Foodstuff and home essentials",
    body: "Shop daily foodstuff, home packs, drinks, and essentials from grocery vendors.",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=78"
  },
  Pharmacy: {
    category: "Pharmacy",
    slug: "med",
    label: "Med",
    eyebrow: "Pharmacy and care items",
    body: "Browse care items, wellness packs, pharmacy products, and ask-price medical essentials.",
    image: "https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&w=1200&q=78"
  },
  Fashion: {
    category: "Fashion",
    slug: "fashion",
    label: "Fashion",
    eyebrow: "Clothing and style vendors",
    body: "Find outfits, shoes, bags, accessories, and style items from fashion vendors.",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=78"
  },
  Electronics: {
    category: "Electronics",
    slug: "electronics",
    label: "Electronics",
    eyebrow: "Home electronics and devices",
    body: "Shop TVs, audio gear, small appliances, cables, and electronics from verified vendors.",
    image: "https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=1200&q=78"
  },
  Gadgets: {
    category: "Gadgets",
    slug: "gadgets",
    label: "Gadgets",
    eyebrow: "Phones, accessories, and smart tech",
    body: "Find phones, power banks, smart accessories, wearables, and everyday tech gadgets.",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=78"
  }
};

const stressfreeFoodsPhotos = {
  chicken: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=720&q=82",
  fish: "https://images.unsplash.com/photo-1534482421-64566f976cfa?auto=format&fit=crop&w=720&q=82",
  beef: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=720&q=82",
  offal: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=720&q=82",
  snails: "https://images.unsplash.com/photo-1550828520-4cb496926fc9?auto=format&fit=crop&w=720&q=82",
  prawns: "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?auto=format&fit=crop&w=720&q=82",
  sausages: "https://images.unsplash.com/photo-1612392062798-3a6e9a64c0ee?auto=format&fit=crop&w=720&q=82"
} as const;

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
      },
      {
        id: "techhub-ikeja",
        name: "TechHub Electronics",
        category: "Electronics",
        products: [
          { id: "smart-tv-techhub-ikeja", name: "Smart TV 43 inch", price: 285000, image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "bluetooth-speaker-techhub-ikeja", name: "Bluetooth Speaker", price: 38500, image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=600&q=70", available: true }
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
      },
      {
        id: "gadget-yard-palms",
        name: "Gadget Yard",
        category: "Gadgets",
        products: [
          { id: "power-bank-gadget-yard-palms", name: "20000mAh Power Bank", price: 24500, image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=600&q=70", available: true },
          { id: "smart-watch-gadget-yard-palms", name: "Smart Watch", price: 56500, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=70", available: true }
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
  },
  {
    id: "ajah-grocery-hub",
    name: "Ajah Grocery Hub",
    location: "Ajah, Lagos State",
    image: "/shopping-stressfree-foods-cover.jpeg",
    stores: [
      {
        id: "stressfree-foods-limited",
        name: "Stressfree Foods Limited",
        image: "/shopping-stressfree-foods-cover.jpeg",
        operatingStatus: "open",
        operatingStates: ["Lagos"],
        locations: [{ state: "Lagos", pickupAddress: "12 Sikiru Oloko Street, Off Bisi Afolabi, Addo Road, Ajah, Lagos State", pickupNote: "Stressfree Foods Limited — Protein & Frozen Foods." }],
        category: "Grocery",
        pickupAddress: "12 Sikiru Oloko Street, Off Bisi Afolabi, Addo Road, Ajah, Lagos State",
        pickupNote: "Stressfree Foods Limited — Protein & Frozen Foods.",
        productTypes: ["Chicken & Turkey", "Frozen & Fresh Fish", "Beef & Goat", "Beef Accessories", "Snails & Prawns", "Extras"],
        products: [
          { id: "stressfree-orobo-chicken", name: "Orobo Chicken (1kg)", type: "Chicken & Turkey", price: 6800, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-soft-chicken", name: "Soft Chicken (1kg)", type: "Chicken & Turkey", price: 4700, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-boneless-chicken", name: "Boneless Chicken (1kg)", type: "Chicken & Turkey", price: 7000, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-chicken-wings", name: "Chicken Wings (1kg)", type: "Chicken & Turkey", price: 7500, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-full-chicken", name: "Full Chicken (from)", type: "Chicken & Turkey", price: 9000, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-native-chicken-2-5kg", name: "Native Chicken 2.5kg", type: "Chicken & Turkey", price: 16000, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-full-soft-chicken", name: "Full Chicken (Soft)", type: "Chicken & Turkey", price: 13000, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-gizzards", name: "Gizzards (1kg)", type: "Chicken & Turkey", price: 6500, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-chicken-head-legs", name: "Chicken Head & Legs (1kg)", type: "Chicken & Turkey", price: 2200, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-turkey-wings", name: "Turkey Wings (1kg)", type: "Chicken & Turkey", price: 10000, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-turkey-finger", name: "Turkey Finger (1kg)", type: "Chicken & Turkey", price: 7500, image: stressfreeFoodsPhotos.chicken, available: true },
          { id: "stressfree-titus", name: "Titus (1kg)", type: "Frozen & Fresh Fish", price: 10000, image: stressfreeFoodsPhotos.fish, available: true },
          { id: "stressfree-sawa", name: "Sawa (1kg)", type: "Frozen & Fresh Fish", price: 3300, image: stressfreeFoodsPhotos.fish, available: true },
          { id: "stressfree-kote", name: "Kote (1kg)", type: "Frozen & Fresh Fish", price: 5000, image: stressfreeFoodsPhotos.fish, available: true },
          { id: "stressfree-panla-hake", name: "Panla (Hake) (1kg)", type: "Frozen & Fresh Fish", price: 4800, image: stressfreeFoodsPhotos.fish, available: true },
          { id: "stressfree-owere", name: "Owere (1kg)", type: "Frozen & Fresh Fish", price: 4700, image: stressfreeFoodsPhotos.fish, available: true },
          { id: "stressfree-tilapia", name: "Tilapia (1kg)", type: "Frozen & Fresh Fish", price: 6000, image: stressfreeFoodsPhotos.fish, available: true },
          { id: "stressfree-mullet", name: "Mullet (1kg)", type: "Frozen & Fresh Fish", price: 4500, image: stressfreeFoodsPhotos.fish, available: true },
          { id: "stressfree-basa", name: "Basa", type: "Frozen & Fresh Fish", price: "ASK_PRICE", image: stressfreeFoodsPhotos.fish, available: true },
          { id: "stressfree-beef", name: "Beef (1kg)", type: "Beef & Goat", price: 9500, image: stressfreeFoodsPhotos.beef, available: true },
          { id: "stressfree-goat", name: "Goat (1kg)", type: "Beef & Goat", price: 11000, image: stressfreeFoodsPhotos.beef, available: true },
          { id: "stressfree-ram", name: "Ram", type: "Beef & Goat", price: 17000, image: stressfreeFoodsPhotos.beef, available: true },
          { id: "stressfree-assorted", name: "Assorted (1kg)", type: "Beef & Goat", price: 7000, image: stressfreeFoodsPhotos.offal, available: true },
          { id: "stressfree-cowtail", name: "Cowtail (1kg)", type: "Beef & Goat", price: 10000, image: stressfreeFoodsPhotos.offal, available: true },
          { id: "stressfree-torso", name: "Torso (1kg)", type: "Beef & Goat", price: 10000, image: stressfreeFoodsPhotos.beef, available: true },
          { id: "stressfree-goat-head-legs", name: "Complete Goat Head & Legs (1kg)", type: "Beef & Goat", price: 7500, image: stressfreeFoodsPhotos.offal, available: true },
          { id: "stressfree-shaki", name: "Shaki (Pack)", type: "Beef Accessories", price: 5000, image: stressfreeFoodsPhotos.offal, available: true },
          { id: "stressfree-ponmo", name: "Ponmo (Pack)", type: "Beef Accessories", price: 3000, image: stressfreeFoodsPhotos.offal, available: true },
          { id: "stressfree-cowleg", name: "Cowleg (Pack)", type: "Beef Accessories", price: "ASK_PRICE", image: stressfreeFoodsPhotos.offal, available: true },
          { id: "stressfree-brisket-bone", name: "Brisket Bone (1kg)", type: "Beef Accessories", price: 5000, image: stressfreeFoodsPhotos.beef, available: true },
          { id: "stressfree-snails-1", name: "Snails 1 (Pack)", type: "Snails & Prawns", price: 8500, image: stressfreeFoodsPhotos.snails, available: true },
          { id: "stressfree-snails-2", name: "Snails 2 (Pack)", type: "Snails & Prawns", price: 13500, image: stressfreeFoodsPhotos.snails, available: true },
          { id: "stressfree-snails-3", name: "Snails 3 (Pack)", type: "Snails & Prawns", price: 17000, image: stressfreeFoodsPhotos.snails, available: true },
          { id: "stressfree-prawns-1", name: "Prawns 1 (Pack)", type: "Snails & Prawns", price: 5000, image: stressfreeFoodsPhotos.prawns, available: true },
          { id: "stressfree-prawns-2", name: "Prawns 2 (Pack)", type: "Snails & Prawns", price: 12500, image: stressfreeFoodsPhotos.prawns, available: true },
          { id: "stressfree-sausages-10", name: "Sausages x10 (Pack)", type: "Extras", price: 2000, image: stressfreeFoodsPhotos.sausages, available: true },
          { id: "stressfree-sausages-12", name: "Sausages x12 (Pack)", type: "Extras", price: 2300, image: stressfreeFoodsPhotos.sausages, available: true }
        ]
      }
    ]
  }
];

export function normalizeShoppingMalls(value: unknown): ShoppingMall[] {
  if (!Array.isArray(value)) return defaultShoppingMalls;

  const mallIds = new Set<string>();
  const storeIds = new Set<string>();
  const malls = value
    .map((entry) => {
      const mall = entry as Partial<ShoppingMall>;
      const name = text(mall.name);
      if (!name) return null;
      const stores = Array.isArray(mall.stores)
        ? mall.stores
          .map((store) => normalizeMallStore(store, text(mall.location)))
          .filter((store): store is MallStore => Boolean(store))
          .map((store) => normalizeStoreIdentity({
            ...store,
            // Older menus used the mall fields as a shared fallback. Copy those
            // values into each vendor once so a later vendor edit is isolated.
            image: store.image || text(mall.image) || defaultShoppingMalls[0].image,
            pickupAddress: store.pickupAddress || text(mall.location) || undefined
          }, storeIds))
        : [];

      return {
        id: uniqueId(text(mall.id) || slug(name), mallIds),
        name,
        location: text(mall.location),
        image: text(mall.image) || defaultShoppingMalls[0].image,
        // Do not replace an empty saved roster with demo vendors. That can make
        // one vendor appear to own another vendor's catalogue.
        stores
      };
    })
    .filter((mall): mall is ShoppingMall => Boolean(mall && mall.stores.length));

  return malls.length ? malls : defaultShoppingMalls;
}

export function buildShoppingCategoryGroups(malls: ShoppingMall[]): ShoppingCategoryGroup[] {
  const sourceMalls = malls.length ? malls : defaultShoppingMalls;

  return mallCategories
    .map((category) => {
      const vendors = sourceMalls.flatMap((mall) =>
        mall.stores.flatMap((store) =>
          store.category === category
            ? storeLocations(store, mall.location).map((location) => ({ mall, store, location }))
            : []
        )
      );
      const productCount = vendors.reduce((count, vendor) => count + vendor.store.products.length, 0);
      const firstVendor = vendors[0];
      const locations = Array.from(new Set(vendors.map(({ location, mall }) => location.pickupAddress || `${location.state}${mall.location ? ` · ${mall.location}` : ""}`).filter(Boolean)));

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

export function shoppingCategorySlug(category: MallCategory) {
  return shoppingCategoryMeta[category].slug;
}

export function shoppingCategoryLabel(category: MallCategory) {
  return shoppingCategoryMeta[category].label;
}

export function shoppingCategoryPath(category: MallCategory) {
  return `/shopping/${shoppingCategorySlug(category)}`;
}

export function shoppingVendorCategoryPath(store: Pick<MallStore, "id" | "category">, location?: Pick<MallStoreLocation, "state"> | null) {
  const path = `${shoppingCategoryPath(store.category)}/${store.id}`;
  return location?.state ? `${path}?state=${encodeURIComponent(location.state)}` : path;
}

export function shoppingVendorAdvertPath(store: Pick<MallStore, "id">, location?: Pick<MallStoreLocation, "state"> | null) {
  const path = `/shopping/store/${store.id}`;
  return location?.state ? `${path}?state=${encodeURIComponent(location.state)}` : path;
}

export function categoryFromShoppingSlug(value: string | null | undefined): MallCategory | null {
  const slugValue = text(value).toLowerCase();
  if (!slugValue) return null;

  if (slugValue === "med" || slugValue === "medicine" || slugValue === "pharmacy") return "Pharmacy";
  const match = mallCategories.find((category) => shoppingCategoryMeta[category].slug === slugValue || category.toLowerCase() === slugValue);
  return match || null;
}

export function findShoppingCategoryGroup(malls: ShoppingMall[], category: MallCategory) {
  return buildShoppingCategoryGroups(malls).find((group) => group.category === category) || null;
}

export function findShoppingVendor(malls: ShoppingMall[], vendorId: string, category?: MallCategory | null, state?: string | null): ShoppingCategoryVendor | null {
  const needle = text(vendorId).toLowerCase();
  if (!needle) return null;

  const groups = buildShoppingCategoryGroups(malls);
  for (const group of groups) {
    if (category && group.category !== category) continue;
    const vendor = group.vendors.find(({ store, location }) =>
      (store.id.toLowerCase() === needle || slug(store.name) === needle)
      && (!state || normalizeState(location.state) === normalizeState(state))
    );
    if (vendor) return vendor;
  }

  return null;
}

export function shoppingProductPrice(product: MallProduct, state?: string | null): MallProductPrice {
  const selectedState = normalizeState(state);
  if (selectedState && product.statePrices && Object.prototype.hasOwnProperty.call(product.statePrices, selectedState)) return product.statePrices[selectedState];
  return product.price;
}

export function storeLocations(store: MallStore, mallLocation = ""): MallStoreLocation[] {
  if (store.locations?.length) return store.locations;
  const fallbackState = normalizeState(store.operatingStates?.[0]) || normalizeState(mallLocation) || "Lagos";
  return [{
    state: fallbackState,
    pickupAddress: store.pickupAddress || mallLocation || undefined,
    pickupPlaceId: store.pickupPlaceId,
    pickupLatitude: store.pickupLatitude,
    pickupLongitude: store.pickupLongitude,
    pickupNote: store.pickupNote,
    priceMode: "consistent"
  }];
}

export function getShoppingStoreImage(store: MallStore, mall: ShoppingMall) {
  return text(store.image)
    || text(store.products.find((product) => text(product.image))?.image)
    || text(mall.image)
    || defaultShoppingMalls[0].image;
}

export function shoppingProductTypes(store: Pick<MallStore, "productTypes" | "products">) {
  return uniqueText([
    ...(store.productTypes || []),
    ...store.products.map((product) => product.type || "")
  ]);
}

function normalizeMallStore(value: unknown, legacyMallLocation = ""): MallStore | null {
  const store = value as Partial<MallStore>;
  const name = text(store.name);
  if (!name) return null;
  const category = normalizeCategory(store.category);
  const products = Array.isArray(store.products) ? store.products.map(normalizeMallProduct).filter(Boolean) : [];
  const legacyStates = normalizeOperatingStates(store.operatingStates);
  const locations = normalizeStoreLocations(store.locations, legacyStates, store, legacyMallLocation);
  return {
    id: text(store.id) || slug(name),
    businessId: text(store.businessId) || undefined,
    name,
    image: text(store.image) || undefined,
    operatingStatus: store.operatingStatus === "closed" ? "closed" : "open",
    operatingStates: locations.map((location) => location.state),
    locations,
    category,
    pickupAddress: text(store.pickupAddress) || undefined,
    pickupPlaceId: text(store.pickupPlaceId) || undefined,
    pickupLatitude: coordinate(store.pickupLatitude, 90),
    pickupLongitude: coordinate(store.pickupLongitude, 180),
    pickupNote: text(store.pickupNote) || undefined,
    campusZoneId: text(store.campusZoneId) || undefined,
    productTypes: normalizeProductTypes(store.productTypes),
    products: products.length ? (products as MallProduct[]) : []
  };
}

function normalizeStoreIdentity(store: MallStore, usedIds: Set<string>): MallStore {
  const productIds = new Set<string>();
  return {
    ...store,
    id: uniqueId(store.id || slug(store.name), usedIds),
    products: store.products.map((product) => ({ ...product, id: uniqueId(product.id || slug(product.name), productIds) }))
  };
}

function uniqueId(candidate: string, usedIds: Set<string>) {
  const base = slug(candidate);
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function normalizeOperatingStates(value: unknown) {
  if (!Array.isArray(value)) return [];
  const selected = new Set(value.map((state) => normalizeState(text(state))).filter(Boolean));
  return NIGERIAN_STATES.filter((state) => selected.has(state));
}

function normalizeStoreLocations(value: unknown, legacyStates: string[], store: Partial<MallStore>, legacyMallLocation: string): MallStoreLocation[] {
  const rawLocations = Array.isArray(value) ? value : [];
  const normalized = rawLocations.reduce<MallStoreLocation[]>((result, entry) => {
    const location = entry as Partial<MallStoreLocation>;
    const state = normalizeState(text(location.state));
    if (!state) return result;
    result.push({
      state,
      pickupAddress: text(location.pickupAddress) || undefined,
      pickupPlaceId: text(location.pickupPlaceId) || undefined,
      pickupLatitude: coordinate(location.pickupLatitude, 90),
      pickupLongitude: coordinate(location.pickupLongitude, 180),
      pickupNote: text(location.pickupNote) || undefined,
      priceMode: location.priceMode === "custom" ? "custom" : "consistent"
    });
    return result;
  }, []);
  const byState = new Map(normalized.map((location) => [location.state, location]));
  const states = legacyStates.length ? legacyStates : Array.from(byState.keys());
  const inferredState: string = normalizeState(legacyMallLocation) || "Lagos";
  const resolvedStates = states.length ? states : [inferredState];
  return resolvedStates.map<MallStoreLocation>((state, index) => byState.get(state) || ({
    state,
    pickupAddress: index === 0 ? text(store.pickupAddress) || legacyMallLocation || undefined : undefined,
    pickupPlaceId: index === 0 ? text(store.pickupPlaceId) || undefined : undefined,
    pickupLatitude: index === 0 ? coordinate(store.pickupLatitude, 90) : undefined,
    pickupLongitude: index === 0 ? coordinate(store.pickupLongitude, 180) : undefined,
    pickupNote: index === 0 ? text(store.pickupNote) || undefined : undefined,
    priceMode: "consistent" as const
  }));
}

function normalizeMallProduct(value: unknown): MallProduct | null {
  const product = value as Partial<MallProduct>;
  const name = text(product.name);
  if (!name) return null;
  return {
    id: text(product.id) || slug(name),
    businessId: text(product.businessId) || undefined,
    name,
    type: text(product.type) || undefined,
    price: normalizePrice(product.price),
    image: text(product.image) || defaultShoppingMalls[0].stores[0].products[0].image,
    available: product.available !== false,
    statePrices: normalizeStatePrices(product.statePrices)
  };
}

function normalizeProductTypes(value: unknown) {
  return Array.isArray(value) ? uniqueText(value.map(text)) : [];
}

function uniqueText(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const cleaned = text(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeStatePrices(value: unknown): Record<string, MallProductPrice> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prices = Object.entries(value as Record<string, unknown>).reduce<Record<string, MallProductPrice>>((result, [state, price]) => {
    const normalizedState = normalizeState(state);
    if (normalizedState) result[normalizedState] = normalizePrice(price);
    return result;
  }, {});
  return Object.keys(prices).length ? prices : undefined;
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

function coordinate(value: unknown, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= max ? number : undefined;
}
