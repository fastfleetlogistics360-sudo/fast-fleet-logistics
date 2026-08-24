-- WhatsApp Cloud API identity linking. Apply after the existing schema.
create table if not exists public.whatsapp_account_links (
  id uuid primary key default gen_random_uuid(),
  whatsapp_phone text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  verified_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_link_challenges (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  whatsapp_phone text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_conversations (
  whatsapp_phone text primary key,
  user_id uuid references public.users(id) on delete set null,
  state text not null default 'awaiting_email',
  state_data jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  whatsapp_phone text not null,
  message_type text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists whatsapp_account_links_set_updated_at on public.whatsapp_account_links;
create trigger whatsapp_account_links_set_updated_at
before update on public.whatsapp_account_links
for each row execute function public.set_updated_at();

drop trigger if exists whatsapp_conversations_set_updated_at on public.whatsapp_conversations;
create trigger whatsapp_conversations_set_updated_at
before update on public.whatsapp_conversations
for each row execute function public.set_updated_at();

create index if not exists whatsapp_link_challenges_active_idx
  on public.whatsapp_link_challenges (whatsapp_phone, expires_at desc)
  where consumed_at is null;
create index if not exists whatsapp_inbound_messages_phone_idx
  on public.whatsapp_inbound_messages (whatsapp_phone, created_at desc);

alter table public.whatsapp_account_links enable row level security;
alter table public.whatsapp_link_challenges enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_inbound_messages enable row level security;

-- These records are operated only by the signed Meta webhook and server routes
-- using the Supabase service role. No browser policy is intentionally provided.
