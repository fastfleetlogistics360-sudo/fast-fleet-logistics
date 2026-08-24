-- WhatsApp account confirmation codes and app-free ordering support.
-- Apply after supabase-whatsapp-delta.sql and the payment reconciliation delta.
begin;

alter table public.whatsapp_link_challenges
  add column if not exists email text,
  add column if not exists code_digest text,
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists send_count integer not null default 1,
  add column if not exists last_sent_at timestamptz,
  add column if not exists locked_at timestamptz;

alter table public.whatsapp_link_challenges
  drop constraint if exists whatsapp_link_challenges_attempts_check,
  drop constraint if exists whatsapp_link_challenges_max_attempts_check,
  drop constraint if exists whatsapp_link_challenges_send_count_check;

alter table public.whatsapp_link_challenges
  add constraint whatsapp_link_challenges_attempts_check check (attempts >= 0),
  add constraint whatsapp_link_challenges_max_attempts_check check (max_attempts between 1 and 10),
  add constraint whatsapp_link_challenges_send_count_check check (send_count between 1 and 5);

create index if not exists whatsapp_link_challenges_email_code_idx
  on public.whatsapp_link_challenges (whatsapp_phone, expires_at desc)
  where consumed_at is null and code_digest is not null;

-- Orders placed through WhatsApp remain normal marketplace orders; this only
-- preserves the channel for operations and analytics.
alter table public.orders
  add column if not exists metadata jsonb not null default '{}'::jsonb;

commit;
