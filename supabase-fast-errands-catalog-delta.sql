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
    ('Drinks & Snacks', 'Coke', null::text, 500::numeric, 10), ('Drinks & Snacks', 'Bottled water', null::text, 300::numeric, 20), ('Drinks & Snacks', 'Plantain chips', null::text, 500::numeric, 30), ('Drinks & Snacks', 'Biscuits', null::text, 400::numeric, 40),
    ('Protein & Frozen', 'Chicken', null::text, 3500::numeric, 10), ('Protein & Frozen', 'Fish', null::text, 2500::numeric, 20), ('Protein & Frozen', 'Beef', null::text, 3000::numeric, 30), ('Protein & Frozen', 'Sausage', null::text, 1200::numeric, 40),
    ('Personal Care', 'Bathing soap', null::text, 700::numeric, 10), ('Personal Care', 'Toothpaste', null::text, 1200::numeric, 20), ('Personal Care', 'Deodorant', null::text, 1800::numeric, 30), ('Personal Care', 'Body cream', null::text, 2200::numeric, 40),
    ('Home Essentials', 'Detergent', null::text, 1200::numeric, 10), ('Home Essentials', 'Hypo / bleach', null::text, 700::numeric, 20), ('Home Essentials', 'Tissue', null::text, 600::numeric, 30), ('Home Essentials', 'Air freshener', null::text, 1500::numeric, 40),
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
