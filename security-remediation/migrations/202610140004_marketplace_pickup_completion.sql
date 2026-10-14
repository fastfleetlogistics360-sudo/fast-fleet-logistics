-- Customer pickup completion. Uses the Stage 1 encrypted-code table and is
-- intentionally additive; delivery fulfilment remains unchanged.
begin;

create or replace function public.complete_marketplace_pickup(
  target_order_id uuid,
  expected_code_digest text,
  verified_by_user_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
declare target_order public.orders%rowtype; confirmation public.marketplace_pickup_confirmations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into target_order from public.orders where id=target_order_id for update;
  if target_order.id is null or target_order.fulfilment_method <> 'PICKUP' or target_order.payment_status <> 'paid'
    or target_order.status <> 'ready_for_pickup' then return false; end if;
  select * into confirmation from public.marketplace_pickup_confirmations where order_id=target_order.id for update;
  if confirmation.order_id is null or confirmation.status <> 'pending' or confirmation.attempts >= confirmation.max_attempts
    or confirmation.code_digest <> expected_code_digest then return false; end if;
  update public.marketplace_pickup_confirmations set status='verified', verified_at=now(), verified_by=verified_by_user_id, updated_at=now()
    where order_id=target_order.id and status='pending' and code_digest=expected_code_digest;
  if not found then return false; end if;
  update public.orders set status='delivered', delivered_at=now(), updated_at=now()
    where id=target_order.id and fulfilment_method='PICKUP' and payment_status='paid' and status='ready_for_pickup';
  return found;
end;
$$;
revoke all on function public.complete_marketplace_pickup(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.complete_marketplace_pickup(uuid,text,uuid) to service_role;

commit;
