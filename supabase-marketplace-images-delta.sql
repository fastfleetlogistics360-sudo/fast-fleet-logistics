-- Fast Fleets 360: marketplace image storage delta.
-- Run this once in the Supabase SQL Editor before deploying marketplace-image uploads.
-- This creates a public marketplace bucket. Browser writes remain disabled: uploads pass
-- through the authenticated admin API, which validates and compresses each image.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('marketplace-images', 'marketplace-images', true, 7340032, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload marketplace images" on storage.objects;
drop policy if exists "Admins update marketplace images" on storage.objects;
drop policy if exists "Admins delete marketplace images" on storage.objects;
drop policy if exists "Marketplace images are public" on storage.objects;
create policy "Marketplace images are public"
  on storage.objects for select
  to public
  using (bucket_id = 'marketplace-images');

commit;
