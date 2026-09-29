-- Local migration only. Review and apply through the normal Supabase migration
-- process; this file is intentionally not executed by the application.
begin;

alter table public.fast_errand_categories
  add column if not exists minimum_age integer;
alter table public.fast_errand_catalog_items
  add column if not exists minimum_age integer;

alter table public.fast_errand_categories
  drop constraint if exists fast_errand_categories_minimum_age_check;
alter table public.fast_errand_categories
  add constraint fast_errand_categories_minimum_age_check
  check (minimum_age is null or (minimum_age >= 18 and minimum_age <= 100));
alter table public.fast_errand_catalog_items
  drop constraint if exists fast_errand_catalog_items_minimum_age_check;
alter table public.fast_errand_catalog_items
  add constraint fast_errand_catalog_items_minimum_age_check
  check (minimum_age is null or (minimum_age >= 18 and minimum_age <= 100));

insert into public.fast_errand_categories (name, description, emoji, sort_order, is_active, minimum_age)
values ('Adult Essentials', 'Private convenience and personal-care essentials.', '🔞', 80, true, 18)
on conflict (name) do update set
  description = excluded.description,
  emoji = excluded.emoji,
  minimum_age = excluded.minimum_age,
  updated_at = now();

insert into public.fast_errand_catalog_items (category_id, name, description, price_ngn, sort_order, is_active, minimum_age)
select category.id, seed.name, seed.description, seed.price_ngn, seed.sort_order, true, null
from public.fast_errand_categories category
cross join (values
  ('Backwoods Russian Cream', '5 cigars', 15000, 10),
  ('Backwoods Honey Berry', '5 cigars', 15000, 20),
  ('Backwoods Sweet Aromatic', '5 cigars', 15000, 30),
  ('Backwoods Honey', '5 cigars', 19500, 40),
  ('Backwoods Dark Stout', '5 cigars', 19500, 50),
  ('Captain Black Dark Crema', 'Pack', 6500, 60),
  ('Benson & Hedges Menthol Boost', '1 pack', 1500, 70),
  ('Dunhill', '1 pack', 2600, 80),
  ('St. Moritz Menthol', '1 pack', 1200, 90),
  ('RAW Classic Rolling Paper', '1 pack', 800, 100),
  ('BIC Lighter', '1 lighter', 1000, 110),
  ('Kiss Classic Condom', '3 pcs', 500, 120),
  ('Fiesta Original Black Condom', '3 pcs', 850, 130),
  ('Fiesta Intim Gel', '70 ml', 6000, 140),
  ('Kiss Lube Gel', '50 ml', 3000, 150),
  ('Assurance Pregnancy Test Strip', '1 strip', 300, 160),
  ('Postinor 2', '2 tablets', 3000, 170),
  ('Postpill', '1 pack', 3000, 180),
  ('OraQuick HIV Self-Test', '1 kit', 5000, 190),
  ('Action Bitters', '20 cl', 1000, 200),
  ('Orijin Bitters', '20 cl', 1000, 210)
) as seed(name, description, price_ngn, sort_order)
where category.name = 'Adult Essentials'
on conflict (category_id, name) do nothing;

commit;
