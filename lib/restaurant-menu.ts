export type RestaurantMenuItem = {
  id: string;
  name: string;
  type: string;
  price: number;
  portion: string;
  imageUrl: string;
};

export type RestaurantKitchen = {
  id: string;
  businessId?: string;
  name: string;
  area: string;
  address: string;
  pickupPlaceId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupNote?: string;
  campusZoneId?: string;
  description: string;
  operatingStatus?: "open" | "closed";
  mealTypes: string[];
  imageUrl: string;
  items: RestaurantMenuItem[];
};

export const restaurantMenuSettingsKey = "restaurant_menu";
export const restaurantMenuStorageKey = "fastfleet_restaurant_menu";

// Most of these are crops from the verified Motherland Kitchen menu artwork
// supplied for this listing. The remaining dish-specific images are real
// Nigerian-style food photography used only where a matching TMK photo was
// not publicly indexed.
const motherlandKitchenPhotos = {
  pepperSoup: "https://images.unsplash.com/photo-1645066804237-08145dd196e9?auto=format&fit=crop&w=600&q=82",
  vegetableSoup: "/restaurants/motherland-vegetable-soup.png",
  egusi: "/restaurants/motherland-egusi-soup.png",
  chickenStew: "/restaurants/motherland-chicken-stew.png",
  rice: "/restaurants/motherland-jollof-rice.png",
  friedRice: "/restaurants/motherland-fried-rice.png",
  pasta: "https://images.unsplash.com/photo-1551892374-ecf8754cf8b0?auto=format&fit=crop&w=600&q=82",
  fish: "https://images.unsplash.com/photo-1725393325387-07f0d4951528?auto=format&fit=crop&w=600&q=82",
  assorted: "/restaurants/motherland-peppered-assorted.png",
  pepperedMeat: "/restaurants/motherland-peppered-meat.png",
  wings: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=82",
  snails: "https://images.unsplash.com/photo-1738071020203-784282e6d4c6?auto=format&fit=crop&w=600&q=82",
  crab: "https://images.unsplash.com/photo-1570377622872-f35b21afd668?auto=format&fit=crop&w=600&q=82",
  porridge: "https://images.unsplash.com/photo-1721942893905-3de47ae22b88?auto=format&fit=crop&w=600&q=82",
  swallow: "/restaurants/motherland-egusi-soup.png"
} as const;

// Indexed photos from KingAdexqo's own Ikota restaurant listing.
const kingAdexqoPhotos = {
  packs: "https://files.chowdeck.com/fit-in/1200x675/images/a5nuroqw0bd81oyry3x0/1705878868.png",
  trays: "https://files.chowdeck.com/fit-in/1200x675/images/2024/2024-06-12/U8SUy49Pz1lV8kZ0l53wg.PNG"
} as const;

export const defaultRestaurantKitchens: RestaurantKitchen[] = [
  {
    id: "fastfleet-kitchen-partners",
    name: "Fast Fleets 360 Kitchen Partners",
    area: "Lekki",
    address: "14 Admiralty Way, Lekki Phase 1, Lagos",
    description: "Fast lunch portions, smoky grills, and office-friendly rice bowls prepared for dispatch speed.",
    mealTypes: ["Rice bowls", "Grills", "Wraps", "Soft drinks"],
    imageUrl: "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80",
    items: [
      {
        id: "jollof-rice-and-chicken",
        name: "Jollof rice and chicken",
        type: "Rice meal",
        price: 3500,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "fried-rice-and-turkey",
        name: "Fried rice and turkey",
        type: "Rice meal",
        price: 5200,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "ofada-rice-bowl",
        name: "Ofada rice bowl",
        type: "Local special",
        price: 4200,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "coca-cola",
        name: "Coca-Cola",
        type: "Soft drink",
        price: 800,
        portion: "1 bottle",
        imageUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=220&q=80"
      }
    ]
  },
  {
    id: "mainland-bites",
    name: "Mainland Bites",
    area: "Yaba",
    address: "22 Herbert Macaulay Way, Yaba, Lagos",
    description: "Affordable student and team portions with classic swallow, pasta, rice, and grilled sides.",
    mealTypes: ["Swallow", "Pasta", "Grills", "Soft drinks"],
    imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80",
    items: [
      {
        id: "amala-ewedu-and-beef",
        name: "Amala, ewedu and beef",
        type: "Swallow",
        price: 3000,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "spaghetti-stir-fry",
        name: "Spaghetti stir fry",
        type: "Pasta",
        price: 3200,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1551892374-ecf8754cf8b0?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "plantain-and-grilled-fish",
        name: "Plantain and grilled fish",
        type: "Grill",
        price: 6500,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "fanta",
        name: "Fanta",
        type: "Soft drink",
        price: 800,
        portion: "1 bottle",
        imageUrl: "https://images.unsplash.com/photo-1566844530615-6b9fa3f4d574?auto=format&fit=crop&w=220&q=80"
      }
    ]
  },
  {
    id: "island-cafe",
    name: "Island Cafe",
    area: "Victoria Island",
    address: "7 Akin Adesola Street, Victoria Island, Lagos",
    description: "Breakfast trays, cafe meals, sandwiches, pastries, and neat desk-ready portions.",
    mealTypes: ["Breakfast", "Sandwiches", "Burgers", "Desserts"],
    imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
    items: [
      {
        id: "english-breakfast",
        name: "English breakfast",
        type: "Breakfast",
        price: 6000,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "chicken-club-sandwich",
        name: "Chicken club sandwich",
        type: "Sandwich",
        price: 4800,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "beef-burger-and-fries",
        name: "Beef burger and fries",
        type: "Burger",
        price: 5500,
        portion: "1 portion",
        imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=220&q=80"
      },
      {
        id: "fresh-parfait-cup",
        name: "Fresh parfait cup",
        type: "Dessert",
        price: 2500,
        portion: "1 cup",
        imageUrl: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=220&q=80"
      }
    ]
  },
  {
    id: "the-motherland-kitchen",
    name: "THE MOTHERLAND KITCHEN",
    area: "Ajah, Lagos",
    address: "Block G, House 6B, June 12 Blvd, Abraham Adesanya Estate, Ajah, Lagos State",
    pickupNote: "Block G, House 6B, Abraham Adesanya Estate.",
    description: "Homemade Nigerian soups, rice meals, grills, and comforting local favourites from Abraham Adesanya Estate.",
    operatingStatus: "open",
    mealTypes: ["SOUP BOWL", "RICE & COMBOS", "PASTA", "SEAFOOD", "PEPPERED PROTEIN", "PORRIDGE", "EXTRAS"],
    imageUrl: "/restaurants/the-motherland-kitchen-cover.png",
    items: [
      { id: "goat-meat-pepper-soup", name: "Nigerian Goat Meat Pepper Soup", type: "SOUP BOWL", price: 12500, portion: "1 bowl", imageUrl: motherlandKitchenPhotos.pepperSoup },
      { id: "village-combo", name: "Village Combo", type: "RICE & COMBOS", price: 7950, portion: "1 portion", imageUrl: motherlandKitchenPhotos.rice },
      { id: "office-lunch-fried-beef-or-chicken", name: "TMK Office Lunch — Fried Beef or Chicken", type: "RICE & COMBOS", price: 7500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.chickenStew },
      { id: "tmk-combo-rice", name: "TMK Combo Rice", type: "RICE & COMBOS", price: 7500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.friedRice },
      { id: "tmk-ibile-pasta", name: "TMK Ibile Pasta", type: "PASTA", price: 17500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.pasta },
      { id: "jollof-rice-with-beef-or-chicken", name: "Jollof Rice with Beef or Chicken", type: "RICE & COMBOS", price: 7500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.rice },
      { id: "okro-vegetable-with-protein-and-eba", name: "Okro Vegetable with Protein of Your Choice and Eba", type: "SOUP BOWL", price: 8500, portion: "1 bowl with eba", imageUrl: motherlandKitchenPhotos.vegetableSoup },
      { id: "ogbono-with-beef-or-chicken-and-eba", name: "Ogbono with Beef or Chicken and Eba", type: "SOUP BOWL", price: 8550, portion: "1 bowl with eba", imageUrl: motherlandKitchenPhotos.egusi },
      { id: "peppered-full-fried-croaker-fish", name: "Peppered Full Fried Croaker Fish", type: "SEAFOOD", price: 22500, portion: "1 full fish", imageUrl: motherlandKitchenPhotos.fish },
      { id: "peppered-full-fried-titus-fish", name: "Peppered Full Fried Titus Fish", type: "SEAFOOD", price: 18000, portion: "1 full fish", imageUrl: motherlandKitchenPhotos.fish },
      { id: "three-litres-seafood-afang", name: "3 Litres Seafood Afang with Eba, Semo or Poundo", type: "SOUP BOWL", price: 85000, portion: "3 litres", imageUrl: motherlandKitchenPhotos.vegetableSoup },
      { id: "three-litres-bitter-leaf-soup", name: "3 Litres Bitter Leaf Soup with Eba", type: "SOUP BOWL", price: 45000, portion: "3 litres", imageUrl: motherlandKitchenPhotos.vegetableSoup },
      { id: "oha-soup-with-protein", name: "Oha Soup with Protein of Your Choice", type: "SOUP BOWL", price: 9950, portion: "1 bowl", imageUrl: motherlandKitchenPhotos.vegetableSoup },
      { id: "three-litres-seafood-okro", name: "3 Litres Seafood Okro with Eba", type: "SOUP BOWL", price: 105000, portion: "3 litres", imageUrl: motherlandKitchenPhotos.vegetableSoup },
      { id: "three-litres-egusi-with-protein", name: "3 Litres Egusi with Protein of Your Choice and Semo or Eba", type: "SOUP BOWL", price: 50000, portion: "3 litres", imageUrl: motherlandKitchenPhotos.swallow },
      { id: "extra-poundo-two", name: "Extra Poundo", type: "EXTRAS", price: 2000, portion: "2 wraps", imageUrl: motherlandKitchenPhotos.swallow },
      { id: "extra-eba-two", name: "Extra Eba", type: "EXTRAS", price: 1500, portion: "2 wraps", imageUrl: motherlandKitchenPhotos.swallow },
      { id: "extra-semo-two", name: "Extra Semo", type: "EXTRAS", price: 1800, portion: "2 wraps", imageUrl: motherlandKitchenPhotos.swallow },
      { id: "beef-spicy-assorted", name: "Beef Spicy Assorted", type: "PEPPERED PROTEIN", price: 8950, portion: "1 portion", imageUrl: motherlandKitchenPhotos.assorted },
      { id: "spicy-wings", name: "Spicy Wings", type: "PEPPERED PROTEIN", price: 9500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.wings },
      { id: "peppered-turkey-gizzard", name: "Peppered Turkey Gizzard", type: "PEPPERED PROTEIN", price: 8000, portion: "1 portion", imageUrl: motherlandKitchenPhotos.assorted },
      { id: "peppered-snails", name: "Peppered Snails", type: "SEAFOOD", price: 21500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.snails },
      { id: "peppered-crabs", name: "Peppered Crabs", type: "SEAFOOD", price: 6500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.crab },
      { id: "fish", name: "Fish", type: "PEPPERED PROTEIN", price: 4850, portion: "1 portion", imageUrl: motherlandKitchenPhotos.fish },
      { id: "peppered-goat-meat", name: "Peppered Goat Meat", type: "PEPPERED PROTEIN", price: 8500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.pepperedMeat },
      { id: "peppered-beef", name: "Peppered Beef", type: "PEPPERED PROTEIN", price: 4850, portion: "1 portion", imageUrl: motherlandKitchenPhotos.pepperedMeat },
      { id: "peppered-turkey", name: "Peppered Turkey", type: "PEPPERED PROTEIN", price: 7500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.pepperedMeat },
      { id: "peppered-chicken", name: "Peppered Chicken", type: "PEPPERED PROTEIN", price: 7000, portion: "1 portion", imageUrl: motherlandKitchenPhotos.pepperedMeat },
      { id: "yam-porridge", name: "Yam Porridge", type: "PORRIDGE", price: 6500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.porridge },
      { id: "plantain-porridge", name: "Plantain Porridge", type: "PORRIDGE", price: 7500, portion: "1 portion", imageUrl: motherlandKitchenPhotos.porridge },
      { id: "farmer-rice", name: "Farmer Rice", type: "RICE & COMBOS", price: 9550, portion: "1 portion", imageUrl: motherlandKitchenPhotos.friedRice }
    ]
  },
  {
    id: "kingadexqo",
    name: "KingAdexqo",
    area: "Ikota, Ajah, Lagos",
    address: "C293, Road 2, Ikota Shopping Complex, Ajah, Lagos State",
    pickupNote: "C293, Road 2, Ikota Shopping Complex.",
    description: "Freshly prepared small-chops packages and sharing trays from Ikota Shopping Complex.",
    operatingStatus: "open",
    mealTypes: ["SMALL CHOPS", "PARTY TRAYS", "EXTRAS"],
    imageUrl: "/restaurants/kingadexqo-logo.jpeg",
    items: [
      { id: "small-chops-package-1200", name: "Small Chops Package", type: "SMALL CHOPS", price: 1200, portion: "1 spring roll, 1 samosa, 5 puff-puff, 2 mosa and 1 gizzard", imageUrl: kingAdexqoPhotos.packs },
      { id: "small-chops-package-1500", name: "Small Chops Package with Chicken", type: "SMALL CHOPS", price: 1500, portion: "1 spring roll, 1 samosa, 5 puff-puff, 2 mosa, 1 gizzard and 1 chicken", imageUrl: kingAdexqoPhotos.packs },
      { id: "small-chops-package-2000", name: "Small Chops Package with Stick Meat", type: "SMALL CHOPS", price: 2000, portion: "1 spring roll, 1 samosa, 5 puff-puff, 2 mosa, 1 gizzard, 1 stick meat and 1 chicken", imageUrl: kingAdexqoPhotos.packs },
      { id: "small-chops-package-2500", name: "Premium Small Chops Package", type: "SMALL CHOPS", price: 2500, portion: "2 spring rolls, beef and chicken samosa, 5 puff-puff, 2 mosa, 1 gizzard, 1 stick meat and 1 chicken", imageUrl: kingAdexqoPhotos.packs },
      { id: "small-chops-package-3000", name: "Small Chops Package with Fish in Batter", type: "SMALL CHOPS", price: 3000, portion: "2 spring rolls, beef and chicken samosa, 5 puff-puff, 2 mosa, 1 gizzard, 1 stick meat, 1 fish in batter and 1 chicken", imageUrl: kingAdexqoPhotos.packs },
      { id: "small-chops-package-3500-prawn", name: "Small Chops Package with Prawn in Batter", type: "SMALL CHOPS", price: 3500, portion: "2 spring rolls, beef and chicken samosa, 5 puff-puff, 2 mosa, 1 gizzard, 1 stick meat, fish and prawn in batter, and 1 chicken", imageUrl: kingAdexqoPhotos.packs },
      { id: "small-chops-package-3500-snail", name: "Small Chops Package with Pepper Snail", type: "SMALL CHOPS", price: 3500, portion: "2 spring rolls, beef and chicken samosa, 5 puff-puff, 2 mosa, 1 gizzard, 1 stick meat, 1 pepper snail and 1 chicken", imageUrl: kingAdexqoPhotos.packs },
      { id: "small-chops-package-4500", name: "KingAdexqo Special Small Chops Package", type: "SMALL CHOPS", price: 4500, portion: "2 spring rolls, beef and chicken samosa, 5 puff-puff, 2 mosa, 1 gizzard, 1 stick meat, fish and prawn in batter, 1 pepper snail and 1 chicken", imageUrl: kingAdexqoPhotos.packs },
      { id: "party-tray-9000", name: "Small Chops Tray", type: "PARTY TRAYS", price: 9000, portion: "5 spring rolls, 5 samosa, 20 puff-puff, 10 mosa, 5 gizzards, 5 stick meat and 5 chicken", imageUrl: kingAdexqoPhotos.trays },
      { id: "party-tray-17000", name: "Small Chops Tray", type: "PARTY TRAYS", price: 17000, portion: "10 spring rolls, 10 samosa, 30 puff-puff, 10 mosa, 10 gizzards, 10 stick meat and 10 chicken", imageUrl: kingAdexqoPhotos.trays },
      { id: "party-tray-29000", name: "Small Chops Tray", type: "PARTY TRAYS", price: 29000, portion: "20 spring rolls, 20 samosa, 40 puff-puff, 20 gizzards, 20 stick meat and 20 chicken", imageUrl: kingAdexqoPhotos.trays },
      { id: "party-tray-30000", name: "Small Chops Tray with Fish and Prawns", type: "PARTY TRAYS", price: 30000, portion: "10 spring rolls, 10 samosa, 30 puff-puff, 10 mosa, 10 gizzards, 10 stick meat, 10 chicken, 10 prawns in batter and 10 fish in batter", imageUrl: kingAdexqoPhotos.trays },
      { id: "party-tray-40000", name: "Deluxe Small Chops Tray", type: "PARTY TRAYS", price: 40000, portion: "10 spring rolls, 10 samosa, 30 puff-puff, 10 mosa, 10 gizzards, 10 stick meat, 10 chicken, 10 prawns in batter, 10 fish in batter, 10 snails and 10 chicken kebab", imageUrl: kingAdexqoPhotos.trays },
      { id: "party-tray-80000", name: "Grand Small Chops Tray", type: "PARTY TRAYS", price: 80000, portion: "20 spring rolls, 20 samosa, 40 puff-puff, 20 mosa, 20 gizzards, 20 stick meat, 20 fish in batter, 20 prawns in batter, 20 pepper snails and 20 chicken", imageUrl: kingAdexqoPhotos.trays },
      { id: "single-packaging-pouch", name: "Single Packaging Pouch", type: "EXTRAS", price: 100, portion: "1 pouch", imageUrl: kingAdexqoPhotos.packs },
      { id: "paper-packaging-box", name: "Paper Packaging Box", type: "EXTRAS", price: 1000, portion: "1 box", imageUrl: kingAdexqoPhotos.packs }
    ]
  }
];

export function normalizeRestaurantKitchens(value: unknown): RestaurantKitchen[] {
  if (!Array.isArray(value)) return defaultRestaurantKitchens;

  const kitchens = value
    .map((entry, index) => {
      const kitchen = entry as Partial<RestaurantKitchen>;
      const fallback = defaultRestaurantKitchens[index] || defaultRestaurantKitchens[0];
      const name = text(kitchen.name) || fallback.name;
      const items = Array.isArray(kitchen.items) ? kitchen.items.map(normalizeRestaurantItem).filter(Boolean) : [];

      return {
        id: text(kitchen.id) || slug(name),
        businessId: text(kitchen.businessId) || undefined,
        name,
        area: text(kitchen.area) || fallback.area,
        address: text(kitchen.address) || fallback.address,
        pickupPlaceId: text(kitchen.pickupPlaceId) || undefined,
        pickupLatitude: coordinate(kitchen.pickupLatitude, 90),
        pickupLongitude: coordinate(kitchen.pickupLongitude, 180),
        pickupNote: text(kitchen.pickupNote) || undefined,
        campusZoneId: text(kitchen.campusZoneId) || undefined,
        description: text(kitchen.description) || fallback.description,
        operatingStatus: kitchen.operatingStatus === "closed" ? ("closed" as const) : ("open" as const),
        mealTypes: Array.isArray(kitchen.mealTypes) ? kitchen.mealTypes.map(text).filter(Boolean) : fallback.mealTypes,
        imageUrl: text(kitchen.imageUrl) || fallback.imageUrl,
        items: items.length > 0 ? (items as RestaurantMenuItem[]) : fallback.items
      };
    })
    .filter((kitchen) => kitchen.name && kitchen.items.length > 0);

  return kitchens.length > 0 ? kitchens : defaultRestaurantKitchens;
}

export function normalizeRestaurantItem(value: unknown): RestaurantMenuItem | null {
  const item = value as Partial<RestaurantMenuItem>;
  const name = text(item.name);
  const price = Number(item.price);

  if (!name || !Number.isFinite(price) || price < 0) return null;

  return {
    id: text(item.id) || slug(name),
    name,
    type: text(item.type) || "Meal",
    price: Math.round(price),
    portion: text(item.portion) || "1 portion",
    imageUrl: text(item.imageUrl) || defaultRestaurantKitchens[0].items[0].imageUrl
  };
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
