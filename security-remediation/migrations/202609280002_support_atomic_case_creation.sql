-- Support Center Phase 3: make ticket creation, case initialization, and
-- verified Case 360 links one service-role-only database transaction.
-- Apply after 202609280001_support_context_foundation.sql.

begin;

create or replace function public.support_staffed_deadline(start_at timestamptz, minutes_to_add integer)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  cursor_at timestamptz := start_at;
  remaining integer := minutes_to_add;
begin
  while remaining > 0 loop
    if extract(hour from cursor_at at time zone 'Africa/Lagos') between 8 and 19 then
      cursor_at := cursor_at + interval '1 minute';
      remaining := remaining - 1;
    else
      cursor_at := cursor_at + interval '1 minute';
    end if;
  end loop;
  return cursor_at;
end;
$$;

create or replace function public.create_support_case_atomic(
  next_idempotency_key uuid,
  next_user_id uuid,
  next_contact_name text,
  next_contact_email text,
  next_contact_phone text,
  next_topic text,
  next_subject text,
  next_ticket_message text,
  next_priority text,
  next_customer_message text,
  next_bot_message text,
  next_category text,
  next_subcategory text,
  next_delivery_id uuid,
  next_order_id uuid
)
returns table(ticket_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_ticket_id uuid;
  existing_ticket_id uuid;
  resolved_persona text;
  resolved_category text;
  resolved_subcategory text;
  resolved_priority text;
  resolved_queue text;
  resolved_tracking_code text;
  now_at timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Support ticket creation is restricted to the server.' using errcode = '42501';
  end if;
  if next_idempotency_key is null then
    raise exception 'Support idempotency key is required.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(next_topic, ''))) not between 1 and 80
    or char_length(coalesce(next_subject, '')) not between 1 and 180
    or char_length(trim(coalesce(next_ticket_message, ''))) not between 6 and 2100
    or next_priority not in ('normal', 'high', 'urgent') then
    raise exception 'Support request is invalid.' using errcode = '22023';
  end if;
  if char_length(coalesce(next_contact_name, '')) > 120
    or char_length(coalesce(next_contact_email, '')) > 180
    or char_length(coalesce(next_contact_phone, '')) > 40 then
    raise exception 'Support contact identity is invalid.' using errcode = '22023';
  end if;
  if next_customer_message is not null and char_length(trim(next_customer_message)) not between 6 and 2000 then
    raise exception 'Customer support message is invalid.' using errcode = '22023';
  end if;
  if next_bot_message is not null and char_length(next_bot_message) > 1000 then
    raise exception 'Support automation message is invalid.' using errcode = '22023';
  end if;
  if (next_delivery_id is not null or next_order_id is not null) and next_user_id is null then
    raise exception 'Authenticated ownership is required for support context.' using errcode = '42501';
  end if;

  select case when u.role::text in ('customer', 'rider', 'business', 'investor') then u.role::text else 'customer' end
    into resolved_persona
    from public.users u where u.id = next_user_id;
  resolved_persona := coalesce(resolved_persona, 'customer');
  resolved_category := case
    when next_topic = 'rider_kyc' then 'rider'
    when next_topic = 'wallet' then 'payment'
    when next_topic = 'business' then 'business'
    when next_topic = 'delivery' then 'delivery'
    else 'other'
  end;
  resolved_subcategory := case resolved_category
    when 'rider' then 'account_kyc'
    when 'payment' then 'other'
    when 'business' then 'account_issue'
    when 'other' then 'general'
    else 'other'
  end;

  -- Keep category authority in the transaction. Unknown or persona-invalid input
  -- deterministically falls back to the canonical topic-derived category.
  if (resolved_persona = 'customer' and (next_category, next_subcategory) in (
    ('delivery','rider_delayed'),('delivery','rider_did_not_arrive'),('delivery','delivery_status_problem'),('delivery','delivery_marked_complete_incorrectly'),('delivery','other'),
    ('order','order_not_progressing'),('order','wrong_item'),('order','missing_item'),('order','damaged_item'),('order','vendor_preparation_delay'),('order','other'),
    ('payment','payment_failed'),('payment','charged_not_confirmed'),('payment','duplicate_payment'),('payment','verification'),('payment','other'),
    ('account','login_access'),('account','profile'),('account','verification_kyc'),('account','restriction'),('account','other'),
    ('storage','booking'),('storage','payment'),('storage','access'),('storage','extension'),('storage','facility_issue'),
    ('safety','unsafe_delivery'),('safety','threat_harassment'),('safety','accident'),('safety','emergency'),('other','general')
  )) or (resolved_persona = 'rider' and (next_category, next_subcategory) in (
    ('rider','delivery_job'),('rider','pin'),('rider','earnings'),('rider','vehicle_bicycle'),('rider','account_kyc'),('rider','safety'),('rider','other'),
    ('account','login_access'),('account','verification_kyc'),('account','other'),('safety','unsafe_delivery'),('safety','threat_harassment'),('safety','accident'),('safety','emergency'),('other','general')
  )) or (resolved_persona = 'business' and (next_category, next_subcategory) in (
    ('business','kyc'),('business','listing'),('business','marketplace_order'),('business','preparation'),('business','payment_payout'),('business','rider_issue'),('business','account_issue'),
    ('payment','payment_failed'),('payment','verification'),('payment','other'),('safety','unsafe_delivery'),('safety','other'),('other','general')
  )) or (resolved_persona = 'investor' and (next_category, next_subcategory) in (
    ('investor','fleet_asset'),('investor','rider_assignment'),('investor','earnings'),('investor','maintenance'),('investor','payout_withdrawal'),('investor','dashboard_discrepancy'),
    ('account','login_access'),('account','other'),('other','general')
  )) then
    resolved_category := next_category;
    resolved_subcategory := next_subcategory;
  end if;
  resolved_priority := case when resolved_category = 'safety' then 'urgent' when resolved_category in ('delivery','order','payment','rider','business') then 'high' else 'normal' end;
  resolved_queue := case when resolved_category = 'payment' then 'payments_finance' when resolved_category = 'rider' then 'rider_fleet_operations' when resolved_category = 'business' then 'business_support' when resolved_category = 'safety' then 'safety_risk' else 'customer_care_operations' end;

  if next_delivery_id is not null then
    select d.delivery_code into resolved_tracking_code from public.deliveries d where d.id = next_delivery_id and d.customer_id = next_user_id;
    if resolved_tracking_code is null then raise exception 'Support delivery context is not owned by this customer.' using errcode = '42501'; end if;
  end if;
  if next_order_id is not null and not exists (select 1 from public.orders o where o.id = next_order_id and o.customer_id = next_user_id) then
    raise exception 'Support order context is not owned by this customer.' using errcode = '42501';
  end if;

  insert into public.support_tickets (idempotency_key, user_id, contact_name, contact_email, contact_phone, topic, subject, message, priority, status, assigned_admin_id, admin_notes, delivery_id, tracking_code, persona, category, subcategory, support_queue, sla_first_response_at, sla_resolution_at, last_activity_at)
  values (next_idempotency_key, next_user_id, next_contact_name, next_contact_email, next_contact_phone, trim(next_topic), next_subject, next_ticket_message, resolved_priority, 'open', null, null, next_delivery_id, coalesce(resolved_tracking_code, null), resolved_persona, resolved_category, resolved_subcategory, resolved_queue, public.support_staffed_deadline(now_at, case resolved_priority when 'urgent' then 15 when 'high' then 60 else 480 end), public.support_staffed_deadline(now_at, case resolved_priority when 'urgent' then 240 when 'high' then 720 else 1440 end), now_at)
  on conflict (idempotency_key) do nothing returning id into inserted_ticket_id;

  if inserted_ticket_id is null then
    select st.id into existing_ticket_id from public.support_tickets st
      where st.idempotency_key = next_idempotency_key and st.user_id is not distinct from next_user_id and st.contact_name is not distinct from next_contact_name and st.contact_email is not distinct from next_contact_email and st.contact_phone is not distinct from next_contact_phone and st.topic = trim(next_topic) and st.subject is not distinct from next_subject and st.message = next_ticket_message and st.priority = resolved_priority and st.category = resolved_category and st.subcategory = resolved_subcategory
      and (next_delivery_id is null or exists (select 1 from public.support_case_links scl where scl.ticket_id = st.id and scl.delivery_id = next_delivery_id))
      and (next_order_id is null or exists (select 1 from public.support_case_links scl where scl.ticket_id = st.id and scl.order_id = next_order_id));
    if existing_ticket_id is null then raise exception 'Support idempotency key conflict.' using errcode = '23505'; end if;
    return query select existing_ticket_id, false;
    return;
  end if;

  if next_bot_message is not null then insert into public.support_messages (ticket_id, sender_type, sender_user_id, body) values (inserted_ticket_id, 'bot', null, next_bot_message); end if;
  if next_customer_message is not null then insert into public.support_messages (ticket_id, sender_type, sender_user_id, body) values (inserted_ticket_id, 'customer', next_user_id, next_customer_message); end if;
  if next_delivery_id is not null then insert into public.support_case_links (ticket_id, delivery_id, link_role, created_by) values (inserted_ticket_id, next_delivery_id, 'primary', next_user_id); end if;
  if next_order_id is not null then insert into public.support_case_links (ticket_id, order_id, link_role, created_by) values (inserted_ticket_id, next_order_id, 'primary', next_user_id); end if;
  insert into public.support_case_events (ticket_id, actor_user_id, actor_type, event_type, metadata) values (inserted_ticket_id, next_user_id, case when next_user_id is null then 'system' else 'customer' end, 'CASE_CREATED', jsonb_build_object('category', resolved_category, 'persona', resolved_persona));
  return query select inserted_ticket_id, true;
end;
$$;

revoke all on function public.create_support_case_atomic(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_support_case_atomic(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid) to service_role;

commit;
