-- Fast Fleets 360: application-wide secure upload storage delta.
-- Run this delta in Supabase SQL Editor. Do not rerun the complete schema in production.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('rider-documents', 'rider-documents', false, 7340032, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]),
  ('business-documents', 'business-documents', false, 7340032, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]),
  ('delivery-proofs', 'delivery-proofs', false, 7340032, array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('profile-photos', 'profile-photos', true, 7340032, array['image/jpeg', 'image/png', 'image/webp']::text[]),
  ('hero-images', 'hero-images', true, 7340032, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- All writes now pass through authenticated application routes using the service role.
-- Removing browser write policies prevents direct-to-storage validation bypasses.
drop policy if exists "Riders upload own documents" on storage.objects;
drop policy if exists "Riders update own documents" on storage.objects;
drop policy if exists "Riders delete own documents" on storage.objects;
drop policy if exists "Businesses upload own documents" on storage.objects;
drop policy if exists "Businesses update own documents" on storage.objects;
drop policy if exists "Businesses delete own documents" on storage.objects;
drop policy if exists "Assigned riders upload delivery proofs" on storage.objects;
drop policy if exists "Assigned riders update delivery proofs" on storage.objects;
drop policy if exists "Assigned riders delete delivery proofs" on storage.objects;
drop policy if exists "Users upload own profile photos" on storage.objects;
drop policy if exists "Users update own profile photos" on storage.objects;
drop policy if exists "Users delete own profile photos" on storage.objects;
drop policy if exists "Admins upload hero images" on storage.objects;
drop policy if exists "Admins update hero images" on storage.objects;
drop policy if exists "Admins delete hero images" on storage.objects;

drop policy if exists "Riders and admins read rider documents" on storage.objects;
create policy "Riders and admins read rider documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'rider-documents'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.current_user_is_admin()
    )
  );

drop policy if exists "Businesses and admins read business documents" on storage.objects;
create policy "Businesses and admins read business documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'business-documents'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.current_user_is_admin()
    )
  );

drop policy if exists "Delivery proofs are readable by signed in users" on storage.objects;
drop policy if exists "Delivery participants read delivery proofs" on storage.objects;
create policy "Delivery participants read delivery proofs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1
      from public.deliveries d
      left join public.rider_profiles rp on rp.id = d.rider_id
      where coalesce(d.metadata -> 'pickup_proof' ->> 'path', '') = name
        and (
          d.customer_id = auth.uid()
          or rp.user_id = auth.uid()
          or d.metadata ->> 'marketplace_customer_id' = auth.uid()::text
          or public.current_user_is_admin()
        )
    )
  );

drop policy if exists "Profile photos are public" on storage.objects;
create policy "Profile photos are public"
  on storage.objects for select
  to public
  using (bucket_id = 'profile-photos');

drop policy if exists "Hero images are public" on storage.objects;
create policy "Hero images are public"
  on storage.objects for select
  to public
  using (bucket_id = 'hero-images');

commit;
