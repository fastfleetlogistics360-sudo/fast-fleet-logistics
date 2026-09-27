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
  ('Condoms', 'Private personal-care essential.', 1000, 10),
  ('Personal Lubricant', 'Private personal-care essential.', 1500, 20),
  ('Pregnancy Test Kit', 'Private personal-care essential.', 1200, 30),
  ('Breath Mints / Gum', 'Private convenience essential.', 500, 40),
  ('Disposable Cups', 'Private convenience essential.', 500, 50),
  ('Ice Cubes', 'Private convenience essential.', 800, 60),
  ('Bottled Water', 'Private convenience essential.', 500, 70),
  ('Personal Hygiene Essentials', 'Private personal-care essential.', 1000, 80)
) as seed(name, description, price_ngn, sort_order)
where category.name = 'Adult Essentials'
on conflict (category_id, name) do nothing;

commit;
