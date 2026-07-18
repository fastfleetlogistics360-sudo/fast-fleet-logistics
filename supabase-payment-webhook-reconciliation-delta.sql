-- Fast Fleets 360: signed Squad webhook, payment intents, and atomic settlement.
-- Review and run this focused delta once in Supabase. Do not rerun the full schema.

begin;

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('squad')),
  provider_transaction_reference text not null,
  internal_reference text not null,
  purpose text not null check (purpose in (
    'delivery_payment',
    'marketplace_business_order',
    'marketplace_delivery_payment',
    'wallet_funding'
  )),
  owner_user_id uuid not null references public.users(id) on delete restrict,
  expected_amount_minor bigint not null check (expected_amount_minor > 0),
  currency text not null check (currency = upper(currency) and currency = 'NGN'),
  status text not null default 'initialized' check (status in (
    'initialized', 'pending', 'settled', 'failed', 'requires_review'
  )),
  delivery_id uuid references public.deliveries(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  wallet_id uuid references public.wallets(id) on delete restrict,
  provider_status text,
  settlement_attempt_count integer not null default 0 check (settlement_attempt_count >= 0),
  last_verified_at timestamptz,
  settled_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  source text not null default 'checkout' check (source in ('checkout', 'legacy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_transaction_reference),
  unique (internal_reference),
  check (num_nonnulls(delivery_id, order_id, wallet_id) = 1),
  check (
    (purpose in ('delivery_payment', 'marketplace_delivery_payment') and delivery_id is not null)
    or (purpose = 'marketplace_business_order' and order_id is not null)
    or (purpose = 'wallet_funding' and wallet_id is not null)
  )
);

create index if not exists payment_intents_reconciliation_idx
  on public.payment_intents(status, created_at)
  where status in ('initialized', 'pending');

drop trigger if exists payment_intents_set_updated_at on public.payment_intents;
create trigger payment_intents_set_updated_at
before update on public.payment_intents
for each row execute function public.set_updated_at();

create or replace function public.protect_payment_intent_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'settled' and new.status is distinct from 'settled' then
    raise exception 'Settled payment intents cannot be downgraded' using errcode = '22023';
  end if;
  if old.status = 'requires_review' and new.status is distinct from 'requires_review' then
    raise exception 'Payment intents under review require an explicit administrative remediation' using errcode = '22023';
  end if;
  if old.status = 'failed' and new.status = 'settled' then
    raise exception 'Failed payment intents require review before settlement' using errcode = '22023';
  end if;
  if new.status = 'settled' and new.settled_at is null then
    raise exception 'Settled payment intents require a settlement timestamp' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists payment_intents_protect_transition on public.payment_intents;
create trigger payment_intents_protect_transition
before update on public.payment_intents
for each row execute function public.protect_payment_intent_transition();

create table if not exists public.payment_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('squad')),
  event_key text not null,
  provider_transaction_reference text,
  event_type text not null,
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'retryable', 'ignored')),
  failure_code text,
  retry_count integer not null default 0 check (retry_count >= 0),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, event_key)
);

create index if not exists payment_webhook_receipts_retry_idx
  on public.payment_webhook_receipts(processing_status, received_at)
  where processing_status = 'retryable';

drop trigger if exists payment_webhook_receipts_set_updated_at on public.payment_webhook_receipts;
create trigger payment_webhook_receipts_set_updated_at
before update on public.payment_webhook_receipts
for each row execute function public.set_updated_at();

-- New Squad entries are namespaced. Legacy company-log references are left
-- untouched, while payment settlement references are database-unique.
create unique index if not exists company_transaction_logs_squad_reference_unique_idx
  on public.company_transaction_logs(reference)
  where reference like 'squad:%';

alter table public.payment_intents enable row level security;
alter table public.payment_webhook_receipts enable row level security;
revoke all on table public.payment_intents from anon, authenticated;
revoke all on table public.payment_webhook_receipts from anon, authenticated;

create or replace function public.record_squad_payment_observation(
  target_payment_intent_id uuid,
  next_status text,
  next_failure_code text,
  next_provider_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_intent public.payment_intents%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if next_status not in ('pending', 'failed', 'requires_review') then
    raise exception 'Invalid observation status' using errcode = '22023';
  end if;

  select * into target_intent
  from public.payment_intents
  where id = target_payment_intent_id
  for update;

  if target_intent.id is null then
    raise exception 'Payment intent not found' using errcode = 'P0002';
  end if;
  if target_intent.status = 'settled' then
    return jsonb_build_object('status', 'already_settled');
  end if;
  if target_intent.status = 'requires_review' then
    return jsonb_build_object('status', 'requires_review');
  end if;
  if target_intent.status = 'failed' and next_status <> 'failed' then
    return jsonb_build_object('status', 'failed');
  end if;

  update public.payment_intents
  set status = next_status,
      provider_status = coalesce(next_provider_status, provider_status),
      failure_code = next_failure_code,
      last_verified_at = now(),
      settlement_attempt_count = settlement_attempt_count + 1,
      failed_at = case when next_status = 'failed' then now() else failed_at end,
      updated_at = now()
  where id = target_intent.id;

  return jsonb_build_object('status', next_status);
end;
$$;

create or replace function public.settle_squad_payment_intent(
  target_payment_intent_id uuid,
  next_provider_reference text,
  next_amount_minor bigint,
  next_currency text,
  next_provider_status text,
  next_gateway_reference text default null,
  next_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_intent public.payment_intents%rowtype;
  target_delivery public.deliveries%rowtype;
  target_order public.orders%rowtype;
  target_wallet public.wallets%rowtype;
  customer_wallet public.wallets%rowtype;
  business_wallet public.wallets%rowtype;
  target_transaction public.transactions%rowtype;
  business_credit_transaction_id uuid;
  business_goods_amount numeric := 0;
  order_amount_minor bigint;
  delivery_amount_minor bigint;
  ledger_reference text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select * into target_intent
  from public.payment_intents
  where id = target_payment_intent_id
    and provider = 'squad'
  for update;

  if target_intent.id is null then
    raise exception 'Payment intent not found' using errcode = 'P0002';
  end if;
  if target_intent.status = 'settled' then
    return jsonb_build_object('status', 'already_settled', 'payment_intent_id', target_intent.id);
  end if;
  if target_intent.status in ('failed', 'requires_review') then
    return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
  end if;
  if next_provider_reference <> target_intent.provider_transaction_reference then
    update public.payment_intents
    set status = 'requires_review', failure_code = 'PAYMENT_REFERENCE_MISMATCH', last_verified_at = now(), settlement_attempt_count = settlement_attempt_count + 1
    where id = target_intent.id;
    return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
  end if;
  if next_amount_minor <> target_intent.expected_amount_minor then
    update public.payment_intents
    set status = 'requires_review', failure_code = 'PAYMENT_AMOUNT_MISMATCH', last_verified_at = now(), settlement_attempt_count = settlement_attempt_count + 1
    where id = target_intent.id;
    return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
  end if;
  if upper(next_currency) <> target_intent.currency then
    update public.payment_intents
    set status = 'requires_review', failure_code = 'PAYMENT_CURRENCY_MISMATCH', last_verified_at = now(), settlement_attempt_count = settlement_attempt_count + 1
    where id = target_intent.id;
    return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
  end if;
  if lower(next_provider_status) not in ('success', 'successful') then
    update public.payment_intents
    set status = 'failed', provider_status = next_provider_status, failure_code = 'PAYMENT_NOT_SUCCESSFUL', failed_at = now(), last_verified_at = now(), settlement_attempt_count = settlement_attempt_count + 1
    where id = target_intent.id;
    return jsonb_build_object('status', 'failed', 'payment_intent_id', target_intent.id);
  end if;

  if target_intent.purpose in ('delivery_payment', 'marketplace_delivery_payment') then
    select * into target_delivery from public.deliveries where id = target_intent.delivery_id for update;
    if target_delivery.id is null or target_delivery.customer_id <> target_intent.owner_user_id then
      update public.payment_intents set status = 'requires_review', failure_code = 'PAYMENT_TARGET_INVALID' where id = target_intent.id;
      return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
    end if;
    delivery_amount_minor := round(target_delivery.price_ngn * 100)::bigint;
    if delivery_amount_minor <> target_intent.expected_amount_minor or target_delivery.status not in ('pending_payment', 'searching') then
      update public.payment_intents set status = 'requires_review', failure_code = 'PAYMENT_TARGET_MISMATCH' where id = target_intent.id;
      return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
    end if;

    insert into public.wallets (user_id, wallet_type)
    values (target_intent.owner_user_id, 'customer')
    on conflict (user_id, wallet_type) do nothing;
    select * into customer_wallet from public.wallets
    where user_id = target_intent.owner_user_id and wallet_type = 'customer'
    for update;

    insert into public.transactions (wallet_id, delivery_id, transaction_type, amount_ngn, status, provider, provider_reference, reference, description, metadata)
    values (
      customer_wallet.id, target_delivery.id, 'delivery_payment', target_delivery.price_ngn * -1, 'successful', 'squad',
      target_intent.provider_transaction_reference || ':customer-payment', target_intent.provider_transaction_reference,
      'Squad delivery payment', jsonb_build_object('payment_intent_id', target_intent.id, 'purpose', target_intent.purpose)
    ) on conflict (provider_reference) do nothing;

    update public.deliveries
    set status = 'searching',
        metadata = metadata || jsonb_build_object(
          'payment_provider', 'squad',
          'provider_reference', target_intent.provider_transaction_reference,
          'provider_status', next_provider_status,
          'provider_paid_at', coalesce(next_paid_at, now()),
          'squad_gateway_reference', nullif(next_gateway_reference, '')
        ),
        updated_at = now()
    where id = target_delivery.id;

    insert into public.delivery_events (delivery_id, actor_id, status, title, body)
    values (target_delivery.id, target_intent.owner_user_id, 'searching', 'Payment received', 'Squad payment confirmed. Fast Fleets 360 is notifying online drivers.');

    ledger_reference := 'squad:' || target_intent.provider_transaction_reference || ':delivery-income';
    insert into public.company_transaction_logs (entry_date, category, direction, amount_ngn, title, counterparty, reference, payment_method, status, notes)
    values (current_date, 'delivery_income', 'income', target_delivery.price_ngn, 'Delivery income ' || target_delivery.delivery_code,
      target_intent.owner_user_id::text, ledger_reference, 'squad', 'cleared', 'Recorded by atomic Squad payment settlement.')
    on conflict (reference) where reference like 'squad:%' do nothing;
  elsif target_intent.purpose = 'marketplace_business_order' then
    select * into target_order from public.orders where id = target_intent.order_id for update;
    if target_order.id is null or target_order.customer_id <> target_intent.owner_user_id or target_order.business_id is null then
      update public.payment_intents set status = 'requires_review', failure_code = 'PAYMENT_TARGET_INVALID' where id = target_intent.id;
      return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
    end if;
    order_amount_minor := round(target_order.amount * 100)::bigint;
    if order_amount_minor <> target_intent.expected_amount_minor or target_order.payment_status not in ('pending', 'paid') then
      update public.payment_intents set status = 'requires_review', failure_code = 'PAYMENT_TARGET_MISMATCH' where id = target_intent.id;
      return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
    end if;

    select coalesce(sum(
      case
        when jsonb_typeof(item.value -> 'subtotal') = 'number' and (item.value ->> 'subtotal')::numeric > 0
          then (item.value ->> 'subtotal')::numeric
        when jsonb_typeof(item.value -> 'price') = 'number'
          then (item.value ->> 'price')::numeric * greatest(1, coalesce((item.value ->> 'quantity')::numeric, 1))
        else 0
      end
    ), 0) into business_goods_amount
    from jsonb_array_elements(coalesce(target_order.items, '[]'::jsonb)) as item(value);
    business_goods_amount := round(case when business_goods_amount > 0 then business_goods_amount else target_order.amount end);
    if business_goods_amount <= 0 or business_goods_amount > target_order.amount then
      update public.payment_intents set status = 'requires_review', failure_code = 'PAYMENT_TARGET_MISMATCH' where id = target_intent.id;
      return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
    end if;

    insert into public.wallets (user_id, wallet_type) values (target_order.customer_id, 'customer') on conflict (user_id, wallet_type) do nothing;
    select * into customer_wallet from public.wallets where user_id = target_order.customer_id and wallet_type = 'customer' for update;
    insert into public.wallets (user_id, wallet_type) values (target_order.business_id, 'customer') on conflict (user_id, wallet_type) do nothing;
    select * into business_wallet from public.wallets where user_id = target_order.business_id and wallet_type = 'customer' for update;

    insert into public.transactions (wallet_id, transaction_type, amount_ngn, status, provider, provider_reference, reference, description, metadata)
    values (
      customer_wallet.id, 'delivery_payment', target_order.amount * -1, 'successful', 'squad',
      target_intent.provider_transaction_reference || ':customer-marketplace-payment', target_intent.provider_transaction_reference,
      'Marketplace order payment', jsonb_build_object('payment_intent_id', target_intent.id, 'order_id', target_order.id)
    ) on conflict (provider_reference) do nothing;

    insert into public.transactions (wallet_id, transaction_type, amount_ngn, status, provider, provider_reference, reference, description, metadata)
    values (
      business_wallet.id, 'wallet_funding', business_goods_amount, 'successful', 'business_order_checkout',
      target_intent.provider_transaction_reference || ':business-goods-credit', target_intent.provider_transaction_reference,
      'Business order income', jsonb_build_object('payment_intent_id', target_intent.id, 'order_id', target_order.id, 'business_profile_id', target_order.business_profile_id)
    ) on conflict (provider_reference) do nothing
    returning id into business_credit_transaction_id;

    -- Apply the business balance increment only if this invocation created the
    -- idempotent credit transaction. A duplicate event cannot add value again.
    if business_credit_transaction_id is not null then
      update public.wallets set balance_ngn = balance_ngn + business_goods_amount, updated_at = now() where id = business_wallet.id;
    end if;

    update public.orders
    set status = case when status = 'pending' then 'received' else status end,
        payment_status = 'paid', updated_at = now()
    where id = target_order.id;

    ledger_reference := 'squad:' || target_intent.provider_transaction_reference || ':marketplace-income';
    insert into public.company_transaction_logs (entry_date, category, direction, amount_ngn, title, counterparty, reference, payment_method, status, notes)
    values (current_date, 'delivery_income', 'income', target_order.amount, 'Marketplace income ' || coalesce(target_order.order_code, target_intent.provider_transaction_reference),
      target_intent.owner_user_id::text, ledger_reference, 'squad', 'cleared', 'Recorded by atomic Squad payment settlement.')
    on conflict (reference) where reference like 'squad:%' do nothing;
  elsif target_intent.purpose = 'wallet_funding' then
    select * into target_wallet from public.wallets where id = target_intent.wallet_id for update;
    if target_wallet.id is null or target_wallet.user_id <> target_intent.owner_user_id then
      update public.payment_intents set status = 'requires_review', failure_code = 'PAYMENT_TARGET_INVALID' where id = target_intent.id;
      return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
    end if;
    select * into target_transaction from public.transactions
    where provider_reference = target_intent.provider_transaction_reference
      and transaction_type = 'wallet_funding'
      and wallet_id = target_wallet.id
    for update;
    if target_transaction.id is null or round(target_transaction.amount_ngn * 100)::bigint <> target_intent.expected_amount_minor then
      update public.payment_intents set status = 'requires_review', failure_code = 'PAYMENT_TARGET_MISMATCH' where id = target_intent.id;
      return jsonb_build_object('status', 'requires_review', 'payment_intent_id', target_intent.id);
    end if;
    if target_transaction.status <> 'successful' then
      update public.transactions
      set status = 'successful',
          metadata = metadata || jsonb_build_object('provider_status', next_provider_status, 'gateway_reference', nullif(next_gateway_reference, ''), 'paid_at', coalesce(next_paid_at, now()))
      where id = target_transaction.id;
      update public.wallets set balance_ngn = balance_ngn + target_transaction.amount_ngn, updated_at = now() where id = target_wallet.id;
    end if;
  else
    raise exception 'Unsupported payment intent purpose' using errcode = '22023';
  end if;

  update public.payment_intents
  set status = 'settled',
      provider_status = next_provider_status,
      failure_code = null,
      last_verified_at = now(),
      settlement_attempt_count = settlement_attempt_count + 1,
      settled_at = now(),
      updated_at = now()
  where id = target_intent.id;

  return jsonb_build_object('status', 'settled', 'payment_intent_id', target_intent.id, 'purpose', target_intent.purpose);
end;
$$;

revoke all on function public.record_squad_payment_observation(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.settle_squad_payment_intent(uuid, text, bigint, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_squad_payment_observation(uuid, text, text, text) to service_role;
grant execute on function public.settle_squad_payment_intent(uuid, text, bigint, text, text, text, timestamptz) to service_role;

commit;
