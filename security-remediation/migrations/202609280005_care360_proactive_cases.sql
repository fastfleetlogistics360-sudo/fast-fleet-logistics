-- Care360 proactive cases. Apply after the Phase 4 foundation migration.
-- This is deliberately separate from ordinary customer case creation.
begin;

create or replace function public.create_proactive_support_case_atomic(
  next_incident_key text,
  next_user_id uuid,
  next_delivery_id uuid,
  next_subject text,
  next_customer_message text
)
returns table(ticket_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_ticket_id uuid;
  existing_ticket_id uuid;
  resolved_tracking_code text;
  contact_name text;
  contact_email text;
  contact_phone text;
  now_at timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Proactive support creation is restricted to the server.' using errcode = '42501';
  end if;
  if next_incident_key !~ '^fastconfirm:pickup-proof-dispute:[0-9a-f-]{36}:[0-9TZ:+.-]{20,40}$'
    or next_user_id is null or next_delivery_id is null
    or char_length(coalesce(next_subject, '')) not between 1 and 180
    or char_length(trim(coalesce(next_customer_message, ''))) not between 6 and 2000 then
    raise exception 'Proactive support request is invalid.' using errcode = '22023';
  end if;

  select d.delivery_code into resolved_tracking_code
    from public.deliveries d where d.id = next_delivery_id and d.customer_id = next_user_id;
  if resolved_tracking_code is null then
    raise exception 'Proactive delivery context is not owned by this customer.' using errcode = '42501';
  end if;
  select u.full_name, u.email, u.phone into contact_name, contact_email, contact_phone from public.users u where u.id = next_user_id;

  insert into public.support_tickets (
    idempotency_key, proactive_incident_key, user_id, contact_name, contact_email, contact_phone,
    topic, subject, message, priority, status, delivery_id, tracking_code, persona, category,
    subcategory, support_queue, sla_first_response_at, sla_resolution_at, last_activity_at
  ) values (
    gen_random_uuid(), next_incident_key, next_user_id, contact_name, contact_email, contact_phone,
    'delivery', next_subject, next_customer_message, 'high', 'open', next_delivery_id, resolved_tracking_code,
    'customer', 'delivery', 'delivery_status_problem', 'customer_care_operations',
    public.support_staffed_deadline(now_at, 60), public.support_staffed_deadline(now_at, 720), now_at
  ) on conflict (proactive_incident_key) where proactive_incident_key is not null do nothing
  returning id into inserted_ticket_id;

  if inserted_ticket_id is null then
    select id into existing_ticket_id from public.support_tickets
      where proactive_incident_key = next_incident_key and user_id = next_user_id and delivery_id = next_delivery_id;
    if existing_ticket_id is null then raise exception 'Proactive incident identity conflict.' using errcode = '23505'; end if;
    return query select existing_ticket_id, false;
    return;
  end if;

  insert into public.support_messages (ticket_id, sender_type, sender_user_id, body, visibility, message_type)
    values (inserted_ticket_id, 'bot', null, 'We noticed a delivery check that may need support attention. Our Customer Care team will review it.', 'public', 'system');
  insert into public.support_case_links (ticket_id, delivery_id, link_role, created_by)
    values (inserted_ticket_id, next_delivery_id, 'primary', null);
  insert into public.support_case_events (ticket_id, actor_user_id, actor_type, event_type, metadata)
    values (inserted_ticket_id, null, 'system', 'CASE_CREATED', jsonb_build_object('persona', 'customer', 'category', 'delivery')),
           (inserted_ticket_id, null, 'system', 'PROACTIVE_CASE_CREATED', jsonb_build_object('source', 'fastconfirm'));
  return query select inserted_ticket_id, true;
end;
$$;

revoke all on function public.create_proactive_support_case_atomic(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_proactive_support_case_atomic(text, uuid, uuid, text, text) to service_role;

commit;
