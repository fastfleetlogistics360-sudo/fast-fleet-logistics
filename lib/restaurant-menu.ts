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
  description: string;
  mealTypes: string[];
  imageUrl: string;
  items: RestaurantMenuItem[];
};

export const restaurantMenuSettingsKey = "restaurant_menu";
export const restaurantMenuStorageKey = "fastfleet_restaurant_menu";

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
        description: text(kitchen.description) || fallback.description,
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
