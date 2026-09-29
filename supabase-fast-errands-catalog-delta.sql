-- Admin-managed FastErrands catalogue and one attached fulfilment business account.
-- Run after supabase-schema.sql and supabase-fasterrands-delta.sql.

begin;

create table if not exists public.fast_errand_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text,
  emoji text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.fast_errand_catalog_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.fast_errand_categories(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text,
  price_ngn numeric not null check (price_ngn >= 1),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, name)
);

create index if not exists fast_errand_categories_active_idx on public.fast_errand_categories(is_active, sort_order, name);
create index if not exists fast_errand_catalog_items_category_idx on public.fast_errand_catalog_items(category_id, is_active, sort_order, name);

-- Starter catalogue. Admins can change, hide, or extend every value from the FastErrands admin page.
insert into public.fast_errand_categories (name, description, emoji, sort_order) values
  ('Fresh Produce', 'Everyday fruits, vegetables and cooking essentials.', '🌶️', 10),
  ('Foodstuff', 'Rice, pantry staples and cooking supplies.', '🍚', 20),
  ('Drinks & Snacks', 'Cold drinks, water and quick snacks.', '🥤', 30),
  ('Protein & Frozen', 'Protein and frozen-food essentials.', '🍗', 40),
  ('Personal Care', 'Simple daily-care and hygiene items.', '🧴', 50),
  ('Home Essentials', 'Cleaning and everyday household supplies.', '🧹', 60),
  ('Party & Hangout', 'A few extras for a spontaneous get-together.', '🔥', 70)
on conflict (name) do nothing;

insert into public.fast_errand_catalog_items (category_id, name, description, price_ngn, sort_order)
select category.id, seed.name, seed.description, seed.price_ngn, seed.sort_order
from public.fast_errand_categories category
join (
  values
    ('Fresh Produce', 'Fresh pepper', null::text, 800::numeric, 10), ('Fresh Produce', 'Tomatoes', null::text, 700::numeric, 20), ('Fresh Produce', 'Onions', null::text, 600::numeric, 30), ('Fresh Produce', 'Fresh ugu', null::text, 500::numeric, 40),
    ('Foodstuff', 'Rice', 'Standard bag / measure', 2000::numeric, 10), ('Foodstuff', 'Vegetable oil', null::text, 1500::numeric, 20), ('Foodstuff', 'Noodles', null::text, 1000::numeric, 30), ('Foodstuff', 'Eggs', null::text, 1500::numeric, 40),
    ('Drinks & Snacks', 'Beloxxi Cream Crackers', '30g', 150::numeric, 10), ('Drinks & Snacks', 'McVitie''s Digestive', 'Small Pack', 500::numeric, 20), ('Drinks & Snacks', 'Minimie Chin Chin', '40g', 200::numeric, 30), ('Drinks & Snacks', 'Minimie Chin Chin — 100g', '100g', 500::numeric, 40), ('Drinks & Snacks', 'Munch It — Small Pack', 'Small Pack', 200::numeric, 50), ('Drinks & Snacks', 'Munch It — Regular Pack', 'Regular Pack', 500::numeric, 60), ('Drinks & Snacks', 'Plantain Chips — Small Pack', 'Small Pack', 500::numeric, 70), ('Drinks & Snacks', 'Potato Chips — Small Pack', 'Small Pack', 500::numeric, 80), ('Drinks & Snacks', 'Groundnuts — Small Pack', 'Small Pack', 500::numeric, 90), ('Drinks & Snacks', 'Cheese Balls — Small Pack', 'Small Pack', 200::numeric, 100), ('Drinks & Snacks', 'Popcorn — Small Pack', 'Small Pack', 500::numeric, 110), ('Drinks & Snacks', 'Gala Sausage Roll', '120g', 500::numeric, 120), ('Drinks & Snacks', 'Pringles Original', '165g', 3700::numeric, 130), ('Drinks & Snacks', 'Coca-Cola', '50cl PET', 500::numeric, 140), ('Drinks & Snacks', 'Fanta Orange', '50cl PET', 500::numeric, 150), ('Drinks & Snacks', 'Sprite', '50cl PET', 500::numeric, 160), ('Drinks & Snacks', 'Pepsi', '50cl PET', 500::numeric, 170), ('Drinks & Snacks', 'Bigi Cola', '60cl', 500::numeric, 180), ('Drinks & Snacks', 'Bigi Orange', '60cl', 500::numeric, 190), ('Drinks & Snacks', 'La Casera Apple', '50/60cl', 500::numeric, 200), ('Drinks & Snacks', 'Hollandia Yoghurt Strawberry', '500ml', 600::numeric, 210), ('Drinks & Snacks', 'Hollandia Yoghurt Plain Sweetened', '500ml', 600::numeric, 220), ('Drinks & Snacks', 'Hollandia Yoghurt Strawberry — 1L', '1L', 1000::numeric, 230), ('Drinks & Snacks', 'Hollandia Yoghurt Plain Sweetened — 1L', '1L', 1000::numeric, 240), ('Drinks & Snacks', '5Alive Pulpy Orange', '78cl/85cl', 1500::numeric, 250), ('Drinks & Snacks', 'Chivita Active', '1L', 3300::numeric, 260), ('Drinks & Snacks', 'Chivita Exotic', '1L', 3300::numeric, 270), ('Drinks & Snacks', 'Eva Water', '75cl', 600::numeric, 280), ('Drinks & Snacks', 'Malta Guinness', '33cl', 1000::numeric, 290),
    ('Protein & Frozen', 'Chicken', null::text, 3500::numeric, 10), ('Protein & Frozen', 'Fish', null::text, 2500::numeric, 20), ('Protein & Frozen', 'Beef', null::text, 3000::numeric, 30), ('Protein & Frozen', 'Sausage', null::text, 1200::numeric, 40),
    ('Personal Care', 'Eva Bathing Soap', '1 bar', 700::numeric, 10), ('Personal Care', 'Premier Cool Bathing Soap', '1 bar', 400::numeric, 20), ('Personal Care', 'MyMy Toothpaste', '1 tube', 700::numeric, 30), ('Personal Care', 'Close-Up Toothpaste', '1 tube', 700::numeric, 40), ('Personal Care', 'Oral-B Toothpaste', '1 tube', 1500::numeric, 50), ('Personal Care', 'Toothbrush', '1', 600::numeric, 60), ('Personal Care', 'Oral Green Toothbrush', '1', 400::numeric, 70), ('Personal Care', 'Nivea Body Lotion', '1 bottle', 5000::numeric, 80), ('Personal Care', 'Vaseline Body Lotion', '1 bottle', 3500::numeric, 90), ('Personal Care', 'Nivea Deodorant / Body Spray', '1', 2000::numeric, 100), ('Personal Care', 'Asantee Deodorant / Body Spray', '1', 4500::numeric, 110), ('Personal Care', 'Mega Growth Shampoo', '1 bottle', 1200::numeric, 120), ('Personal Care', 'Revlon Shampoo', '1 bottle', 1600::numeric, 130), ('Personal Care', 'Hair Conditioner', '1 bottle', 1500::numeric, 140), ('Personal Care', 'Dettol Antiseptic Liquid — Small', '1 bottle', 2100::numeric, 150), ('Personal Care', 'Dettol Antiseptic Liquid — Large', '1 bottle', 3700::numeric, 160), ('Personal Care', 'Shaving Stick — Small', '1', 500::numeric, 170), ('Personal Care', 'Shaving Stick — Large', '1', 200::numeric, 180), ('Personal Care', 'Cotton Buds — Small', '1 pack', 100::numeric, 190), ('Personal Care', 'Cotton Buds — Large', '1 pack', 800::numeric, 200),
    ('Home Essentials', 'Mega Laundry Detergent — Small', '1 pack', 200::numeric, 10), ('Home Essentials', 'Mega Laundry Detergent — Large', '1 pack', 500::numeric, 20), ('Home Essentials', 'De Waves Laundry Detergent — Small', '1 pack', 250::numeric, 30), ('Home Essentials', 'De Waves Laundry Detergent — Large', '1 pack', 500::numeric, 40), ('Home Essentials', 'Hypo Bleach', '1 sachet', 100::numeric, 50), ('Home Essentials', 'BNC Insecticide', '1 can', 3700::numeric, 60), ('Home Essentials', 'Rambo Insecticide', '1 can', 2500::numeric, 70), ('Home Essentials', 'Sunshine Air Freshener', '1', 500::numeric, 80), ('Home Essentials', 'Wind Air Freshener', '1', 800::numeric, 90), ('Home Essentials', 'Air Freshener', '1', 1500::numeric, 100), ('Home Essentials', 'Foam Sponge', '1', 200::numeric, 110),
    ('Party & Hangout', 'Disposable cups', null::text, 1000::numeric, 10), ('Party & Hangout', 'Disposable plates', null::text, 1200::numeric, 20), ('Party & Hangout', 'Ice', null::text, 800::numeric, 30), ('Party & Hangout', 'Party snacks', null::text, 2000::numeric, 40)
) as seed(category_name, name, description, price_ngn, sort_order) on seed.category_name = category.name
on conflict (category_id, name) do nothing;

drop trigger if exists fast_errand_categories_set_updated_at on public.fast_errand_categories;
create trigger fast_errand_categories_set_updated_at before update on public.fast_errand_categories for each row execute function public.set_updated_at();
drop trigger if exists fast_errand_catalog_items_set_updated_at on public.fast_errand_catalog_items;
create trigger fast_errand_catalog_items_set_updated_at before update on public.fast_errand_catalog_items for each row execute function public.set_updated_at();

alter table public.fast_errand_categories enable row level security;
alter table public.fast_errand_catalog_items enable row level security;

drop policy if exists "Public reads active FastErrands categories" on public.fast_errand_categories;
create policy "Public reads active FastErrands categories" on public.fast_errand_categories for select using (is_active or public.current_user_role() = 'admin');
drop policy if exists "Public reads active FastErrands catalogue items" on public.fast_errand_catalog_items;
create policy "Public reads active FastErrands catalogue items" on public.fast_errand_catalog_items for select using (is_active or public.current_user_role() = 'admin');

revoke all on public.fast_errand_categories, public.fast_errand_catalog_items from anon, authenticated;
grant select on public.fast_errand_categories, public.fast_errand_catalog_items to anon, authenticated;

commit;
