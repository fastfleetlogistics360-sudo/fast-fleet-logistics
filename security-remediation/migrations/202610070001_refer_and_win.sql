-- Refer & Win referral engine. Apply after the existing production schema.
-- This migration is additive and intentionally is not executed by the application.

begin;

create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  code text not null unique check (code ~ '^FAST-[A-Z0-9-]{8,64}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referral_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{3,64}$'),
  title text not null,
  description text not null,
  campaign_type text not null check (campaign_type in ('customer', 'cyclist')),
  reward_amount_ngn numeric(12,2) not null check (reward_amount_ngn > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  qualification_type text not null check (qualification_type in ('first_completed_qualifying_activity', 'first_completed_delivery_after_approval')),
  qualification_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.referral_campaigns(id) on delete restrict,
  referrer_user_id uuid not null references public.users(id) on delete restrict,
  referred_user_id uuid not null unique references public.users(id) on delete restrict,
  referral_code_id uuid not null references public.referral_codes(id) on delete restrict,
  status text not null default 'registered' check (status in ('registered', 'qualified', 'held', 'reversed')),
  attributed_at timestamptz not null default now(),
  qualified_at timestamptz,
  qualifying_activity_type text,
  qualifying_activity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (referrer_user_id <> referred_user_id)
);

create table if not exists public.referral_attribution_intents (
  id uuid primary key default gen_random_uuid(),
  referral_code_id uuid not null references public.referral_codes(id) on delete cascade,
  campaign_id uuid not null references public.referral_campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_user_id uuid unique references public.users(id) on delete set null,
  check (expires_at > created_at)
);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique references public.referrals(id) on delete restrict,
  campaign_id uuid not null references public.referral_campaigns(id) on delete restrict,
  referrer_user_id uuid not null references public.users(id) on delete restrict,
  amount_ngn numeric(12,2) not null check (amount_ngn > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  status text not null default 'pending' check (status in ('pending', 'available', 'held', 'transferred', 'reversed')),
  pending_at timestamptz not null default now(),
  available_at timestamptz,
  transferred_at timestamptz,
  reversed_at timestamptz,
  held_at timestamptz,
  wallet_transaction_id uuid references public.transactions(id) on delete restrict,
  idempotency_key text not null unique,
  qualifying_activity_type text,
  qualifying_activity_id uuid,
  held_reason text,
  reversal_reason text,
  held_by uuid references public.users(id) on delete set null,
  reversed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'transferred') or (wallet_transaction_id is not null and transferred_at is not null))
);

create table if not exists public.cyclist_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  referral_id uuid references public.referrals(id) on delete set null,
  status text not null default 'submitted' check (status in ('submitted', 'screening', 'assessment_invited', 'assessment_passed', 'approved', 'rider_activated', 'rejected', 'withdrawn', 'suspended')),
  can_ride_bicycle boolean not null,
  residential_area text not null,
  preferred_operating_zone text not null,
  employment_preference text not null check (employment_preference in ('full_time', 'part_time', 'flexible')),
  has_smartphone boolean not null,
  has_valid_id boolean not null,
  has_guarantor boolean not null,
  experience_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  rider_activated_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cyclist_applications_one_active_per_user_idx
  on public.cyclist_applications(user_id)
  where status not in ('rejected', 'withdrawn', 'suspended');
create index if not exists referrals_referrer_created_idx on public.referrals(referrer_user_id, created_at desc);
create index if not exists referrals_campaign_status_idx on public.referrals(campaign_id, status, created_at desc);
create index if not exists referral_rewards_owner_status_idx on public.referral_rewards(referrer_user_id, status, created_at desc);
create index if not exists cyclist_applications_status_created_idx on public.cyclist_applications(status, created_at desc);
create index if not exists referral_attribution_intents_expiry_idx on public.referral_attribution_intents(expires_at) where claimed_at is null;

drop trigger if exists referral_codes_set_updated_at on public.referral_codes;
create trigger referral_codes_set_updated_at before update on public.referral_codes for each row execute function public.set_updated_at();
drop trigger if exists referral_campaigns_set_updated_at on public.referral_campaigns;
create trigger referral_campaigns_set_updated_at before update on public.referral_campaigns for each row execute function public.set_updated_at();
drop trigger if exists referrals_set_updated_at on public.referrals;
create trigger referrals_set_updated_at before update on public.referrals for each row execute function public.set_updated_at();
drop trigger if exists referral_rewards_set_updated_at on public.referral_rewards;
create trigger referral_rewards_set_updated_at before update on public.referral_rewards for each row execute function public.set_updated_at();
drop trigger if exists cyclist_applications_set_updated_at on public.cyclist_applications;
create trigger cyclist_applications_set_updated_at before update on public.cyclist_applications for each row execute function public.set_updated_at();

create or replace function public.create_referral_code_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_referral_code(new.id);
  return new;
end;
$$;

drop trigger if exists users_create_referral_code on public.users;
create trigger users_create_referral_code after insert on public.users
for each row execute function public.create_referral_code_for_new_user();

insert into public.referral_campaigns (slug, title, description, campaign_type, reward_amount_ngn, qualification_type, qualification_config)
values
  ('customer_referral', 'Refer a User', 'Invite someone to join Fast Fleets 360. Your reward unlocks after their first completed qualifying activity.', 'customer', 1000, 'first_completed_qualifying_activity', '{"activity_types":["delivery","marketplace","fast_errand"]}'::jsonb),
  ('cyclist_referral', 'Refer a Cyclist', 'Refer a bicycle rider. Your reward unlocks after approval and their first completed delivery.', 'cyclist', 5000, 'first_completed_delivery_after_approval', '{"vehicle_intent":"bicycle","activity_types":["delivery"]}'::jsonb)
on conflict (slug) do nothing;

create or replace function public.referral_code_for_name(target_name text)
returns text language sql immutable as $$
  select regexp_replace(upper(coalesce(target_name, 'MEMBER')), '[^A-Z0-9]+', '-', 'g')
$$;

create or replace function public.ensure_referral_code(target_user_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  existing_code text;
  name_stub text;
  candidate text;
begin
  if auth.uid() is not null and auth.uid() <> target_user_id and public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'You can only create your own referral code';
  end if;
  select code into existing_code from public.referral_codes where user_id = target_user_id;
  if existing_code is not null then return existing_code; end if;
  select public.referral_code_for_name(full_name) into name_stub from public.users where id = target_user_id;
  name_stub := trim(both '-' from left(coalesce(nullif(name_stub, ''), 'MEMBER'), 18));
  loop
    candidate := 'FAST-' || name_stub || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.referral_codes(user_id, code) values (target_user_id, candidate);
      return candidate;
    exception when unique_violation then
      select code into existing_code from public.referral_codes where user_id = target_user_id;
      if existing_code is not null then return existing_code; end if;
    end;
  end loop;
end;
$$;

create or replace function public.attribute_referral(referrer_code text, campaign_slug text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  target_user_id uuid := auth.uid();
  source_code public.referral_codes%rowtype;
  campaign public.referral_campaigns%rowtype;
  referral_id uuid;
begin
  if target_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.users where id = target_user_id)
     or not exists (select 1 from public.profiles where user_id = target_user_id and deleted_at is null) then
    raise exception 'Complete account setup before applying a referral';
  end if;
  select * into source_code from public.referral_codes where upper(code) = upper(trim(referrer_code)) and is_active for share;
  if source_code.id is null then raise exception 'Referral code is invalid'; end if;
  select * into campaign from public.referral_campaigns where slug = campaign_slug and is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) for share;
  if campaign.id is null then raise exception 'This referral campaign is not available'; end if;
  if source_code.user_id = target_user_id then raise exception 'You cannot use your own referral code'; end if;
  select id into referral_id from public.referrals where referred_user_id = target_user_id for update;
  if referral_id is not null then raise exception 'This account already has a referral attribution'; end if;
  insert into public.referrals(campaign_id, referrer_user_id, referred_user_id, referral_code_id)
  values (campaign.id, source_code.user_id, target_user_id, source_code.id)
  returning id into referral_id;
  insert into public.referral_rewards(referral_id, campaign_id, referrer_user_id, amount_ngn, idempotency_key)
  values (referral_id, campaign.id, source_code.user_id, campaign.reward_amount_ngn, 'referral:' || referral_id::text);
  insert into public.notifications(user_id, title, body, type, channel, metadata)
  values (
    source_code.user_id,
    'Your referral joined Fast Fleets 360',
    case when campaign.campaign_type = 'cyclist' then 'Your cyclist referral has started onboarding. The reward remains pending until their first completed delivery.' else 'Your referral joined Fast Fleets 360. The reward remains pending until their first qualifying activity.' end,
    'referral_reward_pending',
    'in_app',
    jsonb_build_object('referral_id', referral_id, 'campaign', campaign.slug, 'url', '/referrals')
  );
  return referral_id;
end;
$$;

create or replace function public.claim_referral_attribution(target_intent_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  intent public.referral_attribution_intents%rowtype;
  target_user_id uuid := auth.uid();
  target_created_at timestamptz;
  code_value text;
  campaign_value text;
  referral_id uuid;
begin
  if target_user_id is null then raise exception 'Authentication required'; end if;
  select * into intent from public.referral_attribution_intents where id = target_intent_id for update;
  if intent.id is null or intent.claimed_at is not null or intent.expires_at <= now() then raise exception 'This referral invitation has expired'; end if;
  select created_at into target_created_at from public.users where id = target_user_id;
  if target_created_at is null or target_created_at <= intent.created_at then raise exception 'Referral invitations can only be applied while creating a new account'; end if;
  select code into code_value from public.referral_codes where id = intent.referral_code_id;
  select slug into campaign_value from public.referral_campaigns where id = intent.campaign_id;
  referral_id := public.attribute_referral(code_value, campaign_value);
  update public.referral_attribution_intents set claimed_at = now(), claimed_by_user_id = target_user_id where id = intent.id;
  return referral_id;
end;
$$;

create or replace function public.qualify_referral_from_delivery(target_delivery_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  delivery public.deliveries%rowtype;
  rider_user_id uuid;
  customer_referral public.referrals%rowtype;
  cyclist_referral public.referrals%rowtype;
  customer_reward_id uuid;
  cyclist_reward_id uuid;
begin
  select * into delivery from public.deliveries where id = target_delivery_id;
  if delivery.id is null or delivery.status <> 'delivered' then return; end if;
  if coalesce(delivery.metadata ->> 'is_test', 'false') in ('true', '1') or coalesce(delivery.metadata ->> 'source', '') in ('demo', 'admin_demo', 'test') then return; end if;

  select r.* into customer_referral
  from public.referrals r join public.referral_campaigns c on c.id = r.campaign_id
  where r.referred_user_id = delivery.customer_id and c.campaign_type = 'customer' and r.status = 'registered'
  for update of r;
  if customer_referral.id is not null then
    update public.referral_rewards
    set status = 'available', available_at = now(), qualifying_activity_type = 'delivery', qualifying_activity_id = delivery.id
    where referral_id = customer_referral.id and status = 'pending'
    returning id into customer_reward_id;
    if customer_reward_id is not null then
      update public.referrals set status = 'qualified', qualified_at = now(), qualifying_activity_type = 'delivery', qualifying_activity_id = delivery.id where id = customer_referral.id;
      insert into public.notifications(user_id, title, body, type, channel, metadata)
      select customer_referral.referrer_user_id, 'Referral reward unlocked', 'Your referral completed their first qualifying activity. Your reward is now available.', 'referral_reward_available', 'in_app', jsonb_build_object('referral_id', customer_referral.id, 'delivery_id', delivery.id, 'url', '/referrals');
    end if;
  end if;

  if delivery.rider_id is null then return; end if;
  select user_id into rider_user_id from public.rider_profiles where id = delivery.rider_id and application_status = 'approved';
  if rider_user_id is null then return; end if;
  select r.* into cyclist_referral
  from public.referrals r
  join public.referral_campaigns c on c.id = r.campaign_id
  join public.cyclist_applications ca on ca.referral_id = r.id and ca.user_id = rider_user_id and ca.status = 'rider_activated'
  where r.referred_user_id = rider_user_id and c.campaign_type = 'cyclist' and r.status = 'registered'
  for update of r;
  if cyclist_referral.id is null then return; end if;
  update public.referral_rewards
  set status = 'available', available_at = now(), qualifying_activity_type = 'delivery', qualifying_activity_id = delivery.id
  where referral_id = cyclist_referral.id and status = 'pending'
  returning id into cyclist_reward_id;
  if cyclist_reward_id is not null then
    update public.referrals set status = 'qualified', qualified_at = now(), qualifying_activity_type = 'delivery', qualifying_activity_id = delivery.id where id = cyclist_referral.id;
    insert into public.notifications(user_id, title, body, type, channel, metadata)
    select cyclist_referral.referrer_user_id, 'Cyclist referral unlocked', 'Your cyclist referral completed their first delivery. Your reward is now available.', 'referral_reward_available', 'in_app', jsonb_build_object('referral_id', cyclist_referral.id, 'delivery_id', delivery.id, 'url', '/referrals');
  end if;
end;
$$;

create or replace function public.process_referral_delivery_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    perform public.qualify_referral_from_delivery(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists referrals_qualify_on_delivery_completion on public.deliveries;
create trigger referrals_qualify_on_delivery_completion
after update of status on public.deliveries
for each row execute function public.process_referral_delivery_completion();

do $$ begin
  alter table public.transactions drop constraint if exists transactions_transaction_type_check;
  alter table public.transactions add constraint transactions_transaction_type_check check (transaction_type in ('wallet_funding', 'delivery_payment', 'rider_earning', 'withdrawal', 'refund', 'commission', 'referral_reward'));
end $$;

create or replace function public.transfer_referral_reward(target_reward_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  reward public.referral_rewards%rowtype;
  wallet public.wallets%rowtype;
  next_wallet_type text;
  transaction_id uuid;
begin
  select * into reward from public.referral_rewards where id = target_reward_id for update;
  if reward.id is null then raise exception 'Referral reward not found'; end if;
  if reward.referrer_user_id <> auth.uid() and public.current_user_role() <> 'admin' then raise exception 'You cannot transfer this referral reward'; end if;
  if reward.status <> 'available' then raise exception 'This referral reward is not available to transfer'; end if;
  select case when role = 'rider' then 'rider' else 'customer' end into next_wallet_type from public.users where id = reward.referrer_user_id;
  insert into public.wallets(user_id, wallet_type) values(reward.referrer_user_id, next_wallet_type)
  on conflict (user_id, wallet_type) do nothing;
  select * into wallet from public.wallets where user_id = reward.referrer_user_id and wallet_type = next_wallet_type for update;
  insert into public.transactions(wallet_id, transaction_type, amount_ngn, status, provider, provider_reference, description, metadata)
  values (wallet.id, 'referral_reward', reward.amount_ngn, 'successful', 'refer_and_win', 'referral-reward:' || reward.id::text, 'Refer & Win reward', jsonb_build_object('referral_reward_id', reward.id, 'referral_id', reward.referral_id))
  returning id into transaction_id;
  update public.wallets set balance_ngn = balance_ngn + reward.amount_ngn, balance = balance + reward.amount_ngn, updated_at = now() where id = wallet.id;
  update public.referral_rewards set status = 'transferred', transferred_at = now(), wallet_transaction_id = transaction_id where id = reward.id;
  return transaction_id;
exception when unique_violation then
  raise exception 'This referral reward has already been transferred';
end;
$$;

create or replace function public.transition_cyclist_application(target_application_id uuid, next_status text, note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  application public.cyclist_applications%rowtype;
  actor_id uuid := auth.uid();
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only admins can review cyclist applications'; end if;
  select * into application from public.cyclist_applications where id = target_application_id for update;
  if application.id is null then raise exception 'Cyclist application not found'; end if;
  if not ((application.status = 'submitted' and next_status in ('screening', 'rejected', 'withdrawn'))
       or (application.status = 'screening' and next_status in ('assessment_invited', 'rejected'))
       or (application.status = 'assessment_invited' and next_status in ('assessment_passed', 'rejected'))
       or (application.status = 'assessment_passed' and next_status in ('approved', 'rejected'))
       or (application.status = 'approved' and next_status in ('rider_activated', 'suspended'))
       or (application.status = 'rider_activated' and next_status = 'suspended')) then
    raise exception 'Invalid cyclist application transition';
  end if;
  if next_status = 'rejected' and coalesce(trim(note), '') = '' then raise exception 'A rejection reason is required'; end if;
  update public.cyclist_applications set status = next_status, reviewed_at = now(), reviewed_by = actor_id,
    rejection_reason = case when next_status = 'rejected' then trim(note) else rejection_reason end,
    approved_at = case when next_status = 'approved' then now() else approved_at end,
    rider_activated_at = case when next_status = 'rider_activated' then now() else rider_activated_at end
  where id = application.id;
  return application.id;
end;
$$;

create or replace function public.activate_cyclist_rider(target_application_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  application public.cyclist_applications%rowtype;
  rider_id uuid;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Only admins can activate cyclist riders'; end if;
  select * into application from public.cyclist_applications where id = target_application_id for update;
  if application.id is null or application.status <> 'approved' then raise exception 'Approve the cyclist application before rider activation'; end if;
  -- Fleet asset assignment, not recruitment, establishes access to a Fast Fleets bicycle.
  -- Keep the rider's dispatch vehicle selection separate from this account activation.
  insert into public.rider_profiles(user_id, application_status, rider_account_type, address, operating_zone, reviewed_at)
  values (application.user_id, 'approved', 'fastfleets360', application.residential_area, application.preferred_operating_zone, now())
  on conflict (user_id) do update set application_status = 'approved', rider_account_type = 'fastfleets360', operating_zone = excluded.operating_zone, reviewed_at = now()
  returning id into rider_id;
  perform public.transition_cyclist_application(application.id, 'rider_activated');
  return rider_id;
end;
$$;

alter table public.referral_codes enable row level security;
alter table public.referral_campaigns enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_attribution_intents enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.cyclist_applications enable row level security;

create policy "Users read own referral code" on public.referral_codes for select using (user_id = auth.uid() or public.current_user_role() = 'admin');
create policy "Authenticated users read active referral campaigns" on public.referral_campaigns for select using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())) or public.current_user_role() = 'admin');
create policy "Users read own referrals" on public.referrals for select using (referrer_user_id = auth.uid() or referred_user_id = auth.uid() or public.current_user_role() = 'admin');
create policy "Users read own referral rewards" on public.referral_rewards for select using (referrer_user_id = auth.uid() or public.current_user_role() = 'admin');
create policy "Users read own cyclist applications" on public.cyclist_applications for select using (user_id = auth.uid() or public.current_user_role() = 'admin');
create policy "Users create own cyclist applications" on public.cyclist_applications for insert with check (user_id = auth.uid() and status = 'submitted' and referral_id is null);
create policy "Admins manage referral codes" on public.referral_codes for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "Admins manage referral campaigns" on public.referral_campaigns for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "Admins manage referrals" on public.referrals for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "Admins manage referral attribution intents" on public.referral_attribution_intents for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "Admins manage referral rewards" on public.referral_rewards for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy "Admins manage cyclist applications" on public.cyclist_applications for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

revoke all on function public.attribute_referral(text, text) from public;
revoke all on function public.claim_referral_attribution(uuid) from public;
grant execute on function public.claim_referral_attribution(uuid) to authenticated;
revoke all on function public.ensure_referral_code(uuid) from public;
grant execute on function public.ensure_referral_code(uuid) to authenticated, service_role;
revoke all on function public.transfer_referral_reward(uuid) from public;
grant execute on function public.transfer_referral_reward(uuid) to authenticated;
revoke all on function public.transition_cyclist_application(uuid, text, text) from public;
grant execute on function public.transition_cyclist_application(uuid, text, text) to service_role;
revoke all on function public.activate_cyclist_rider(uuid) from public;
grant execute on function public.activate_cyclist_rider(uuid) to service_role;

commit;
