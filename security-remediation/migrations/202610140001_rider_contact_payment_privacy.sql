-- Rider contact information is payment-gated. This is deliberately enforced
-- in RLS as well as API serializers so a browser Supabase query cannot use a
-- rider profile or users join to bypass the customer-facing UI.
begin;

create or replace function public.delivery_payment_is_verified(target_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.deliveries d
    where d.id = target_delivery_id
      and (
        coalesce(d.price_ngn, 0) = 0
        or exists (
          select 1 from public.payment_intents pi
          where pi.delivery_id = d.id and pi.status = 'settled'
        )
        or exists (
          select 1 from public.transactions t
          where t.delivery_id = d.id
            and t.transaction_type = 'delivery_payment'
            and t.status = 'successful'
        )
      )
  );
$$;

revoke all on function public.delivery_payment_is_verified(uuid) from public, anon, authenticated;

drop policy if exists "Customers read assigned rider user profile" on public.users;
create policy "Customers read assigned rider user profile"
  on public.users for select
  using (
    auth.uid() = id
    or public.current_user_role() = 'admin'
    or exists (
      select 1
      from public.deliveries d
      join public.rider_profiles rp on rp.id = d.rider_id
      where rp.user_id = users.id
        and d.customer_id = auth.uid()
        and public.delivery_payment_is_verified(d.id)
    )
  );

drop policy if exists "Customers read assigned rider profile" on public.rider_profiles;
create policy "Customers read assigned rider profile"
  on public.rider_profiles for select
  using (
    public.current_user_role() = 'admin'
    or user_id = auth.uid()
    or exists (
      select 1 from public.deliveries d
      where d.rider_id = rider_profiles.id
        and d.customer_id = auth.uid()
        and public.delivery_payment_is_verified(d.id)
    )
  );

commit;

-- This must commit before the reservation migration can use the new status.
-- PostgreSQL rejects an enum value that is introduced and consumed in the
-- same transaction, so it is intentionally a prerequisite of 140002.
alter type public.delivery_status add value if not exists 'awaiting_customer_payment' after 'searching';
