-- FAST AI Phase 3B: versioned, reviewed knowledge entries.
begin;

create table if not exists public.fast_ai_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,100}$'),
  category text not null check (category in ('company', 'delivery', 'marketplace', 'shopping', 'fast_errand', 'rider', 'vendor', 'storage', 'heavy_logistics', 'support', 'policy')),
  title text not null check (char_length(trim(title)) between 2 and 180),
  body text not null check (char_length(trim(body)) between 10 and 5000),
  source_metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(slug, version)
);

create index if not exists fast_ai_knowledge_published_category_idx on public.fast_ai_knowledge_entries(category, updated_at desc) where status = 'published';
create index if not exists fast_ai_knowledge_slug_version_idx on public.fast_ai_knowledge_entries(slug, version desc);

-- Structured, bounded context records only the last classified intent and
-- optional reference codes. It is not a customer profile or raw transcript.
alter table public.assistant_conversations add column if not exists context jsonb not null default '{}'::jsonb;
alter table public.assistant_messages add column if not exists response_kind text check (response_kind in ('knowledge_retrieval', 'tool_result', 'clarification', 'refusal'));

insert into public.fast_ai_knowledge_entries (slug, category, title, body, source_metadata, version, status)
values
  ('services', 'company', 'Fast Fleets 360 services', 'Fast Fleets 360 provides dispatch and package delivery, restaurant food delivery, shopping for groceries, medicine, fashion, electronics and gadgets, FastErrand, storage facilities and heavy logistics.', '{"source":"approved-company-knowledge"}', 1, 'published'),
  ('fastconfirm', 'company', 'FastConfirm™', 'FastConfirm™ provides post-pickup evidence and delivery details so customers can confirm their item before final drop-off.', '{"source":"approved-company-knowledge"}', 1, 'published'),
  ('secure-hand-off', 'company', 'Secure Hand-Off', 'Secure Hand-Off adds a secure confirmation step at the final delivery handover.', '{"source":"approved-company-knowledge"}', 1, 'published'),
  ('delivery-guidance', 'delivery', 'Sending a package', 'To send a package, use the dispatch booking flow and provide pickup, drop-off, item details and recipient contact information. Availability, pricing and rider assignment are confirmed in that flow.', '{"source":"approved-company-knowledge"}', 1, 'published'),
  ('rider-onboarding', 'rider', 'Delivery partner onboarding', 'To become a Fast Fleets delivery partner, apply through the rider or cyclist onboarding process with valid identification, contact details, vehicle or bicycle information, and requested verification documents.', '{"source":"approved-company-knowledge"}', 1, 'published'),
  ('vendor-onboarding', 'vendor', 'Vendor onboarding', 'Restaurants and other vendors can apply through vendor onboarding with business details, contact information, service location, a catalogue or menu, and requested verification documents.', '{"source":"approved-company-knowledge"}', 1, 'published'),
  ('support-guidance', 'support', 'Customer support', 'For a booking-specific issue, use the support channel with your delivery or order details. FAST AI can explain the available next step but cannot alter, cancel or refund an order.', '{"source":"approved-company-knowledge"}', 1, 'published')
on conflict (slug, version) do nothing;

create or replace function public.fast_ai_knowledge_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists fast_ai_knowledge_entries_touch on public.fast_ai_knowledge_entries;
create trigger fast_ai_knowledge_entries_touch before update on public.fast_ai_knowledge_entries for each row execute function public.fast_ai_knowledge_touch_updated_at();

alter table public.fast_ai_knowledge_entries enable row level security;
-- No browser policy is granted. Customer retrieval is server-only and admin
-- mutations derive both authority and actor from the verified admin session.
revoke all on public.fast_ai_knowledge_entries from anon, authenticated;

commit;
