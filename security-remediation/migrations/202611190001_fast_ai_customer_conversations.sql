-- FAST AI Phase 2D: customer-only conversation persistence.
-- Public/guest chats are intentionally not stored here. Every row belongs to
-- the verified auth user and RLS makes cross-customer reads or writes fail.
begin;

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New FAST AI conversation' check (char_length(trim(title)) between 1 and 120),
  preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  provider text check (provider in ('groq', 'deterministic')),
  response_mode text check (response_mode in ('generative', 'deterministic_fallback')),
  created_at timestamptz not null default now()
);

-- This table is reserved for future, independently-authorised customer tools.
-- Phase 2D does not invoke any tools, so no entries are created yet.
create table if not exists public.assistant_tool_audits (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  outcome text not null check (outcome in ('allowed', 'denied', 'failed')),
  redacted_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assistant_conversations_owner_updated_idx on public.assistant_conversations(user_id, updated_at desc);
create index if not exists assistant_messages_conversation_created_idx on public.assistant_messages(conversation_id, created_at);
create index if not exists assistant_tool_audits_conversation_created_idx on public.assistant_tool_audits(conversation_id, created_at desc);

create or replace function public.fast_ai_customer_touch_conversation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  update public.assistant_conversations
  set updated_at = now(), preview = left(new.body, 180)
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists assistant_messages_touch_conversation on public.assistant_messages;
create trigger assistant_messages_touch_conversation
after insert on public.assistant_messages
for each row execute function public.fast_ai_customer_touch_conversation();

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_tool_audits enable row level security;

drop policy if exists assistant_conversations_owner on public.assistant_conversations;
create policy assistant_conversations_owner on public.assistant_conversations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists assistant_messages_owner on public.assistant_messages;
create policy assistant_messages_owner on public.assistant_messages
  for select to authenticated using (
    exists (select 1 from public.assistant_conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

-- Browser clients cannot forge assistant messages or write tool audit data.
-- Server routes use the authenticated session and derive owner identity.
revoke insert, update, delete on public.assistant_messages from authenticated;
revoke all on public.assistant_tool_audits from authenticated;

commit;
