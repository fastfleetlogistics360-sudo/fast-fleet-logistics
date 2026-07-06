# FastFleet Admin Supabase Setup

Use this when you want Rider approvals, Withdrawal review, Site controls, and Risk signals to write to Supabase instead of demo/local data.

## 1. Run the schema

1. Open Supabase.
2. Choose your FastFleet project.
3. Go to SQL Editor.
4. Open `supabase-schema.sql` from this repo.
5. Paste the whole file and run it.

This creates or updates:

- `rider_profiles`
- `rider_documents`
- `withdrawal_requests`
- `company_transaction_logs`
- `platform_launch_states`
- `platform_settings`
- `support_tickets`
- `fraud_signals`
- wallet tables, functions, policies, storage bucket, and realtime tables

If you only need the new admin site-control table on an already migrated project, run this smaller SQL:

```sql
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_settings_set_updated_at on public.platform_settings;
create trigger platform_settings_set_updated_at
before update on public.platform_settings
for each row execute function public.set_updated_at();

create index if not exists platform_settings_updated_idx on public.platform_settings(updated_at desc);

alter table public.platform_settings enable row level security;

drop policy if exists "Signed in users read platform settings" on public.platform_settings;
create policy "Signed in users read platform settings"
  on public.platform_settings for select
  using (auth.uid() is not null or public.current_user_role() = 'admin');

drop policy if exists "Admins manage platform settings" on public.platform_settings;
create policy "Admins manage platform settings"
  on public.platform_settings for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

insert into public.platform_settings (key, value)
values (
  'admin_site_controls',
  '{
    "bookings_enabled": true,
    "rider_onboarding_enabled": true,
    "wallet_topups_enabled": true,
    "withdrawals_enabled": true,
    "support_status": "open",
    "launch_headline": "FastFleet is live in Lagos and Ogun.",
    "launch_message": "Customers and riders in new states can join the waitlist while operations expand.",
    "wallet_policy": {
      "min_topup_ngn": 500,
      "min_withdrawal_ngn": 3000,
      "max_withdrawal_ngn": 200000,
      "payout_sla_hours": 24
    }
  }'::jsonb
)
on conflict (key) do nothing;
```

## 2. Add environment variables

Set these on your deployment host and in `.env.local` for local testing:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FASTFLEET_ADMIN_USERNAME=FastFleetAdmin
FASTFLEET_ADMIN_PASSWORD="Fastfleet360@#"
FASTFLEET_ADMIN_SECRET=change-this-long-random-secret
SQUAD_SECRET_KEY=sandbox_or_live_squad_secret_key
SQUAD_BASE_URL=https://sandbox-api-d.squadco.com
SQUAD_CALLBACK_ORIGIN=https://your-live-domain.com
NEXT_PUBLIC_SITE_URL=https://your-live-domain.com
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in browser JavaScript, static HTML, or `NEXT_PUBLIC_*`.

## 3. Deploy the Next app, not only the static files

The real admin actions use `/api/admin/*` routes. Those routes exist in the Next.js app and need a server runtime. Deploy the full project with `package.json`, `app/`, `components/`, `lib/`, and `supabase-schema.sql` available.

If you upload only `admin/index.html` to a static host, the cards can open local action panels, but secure Supabase writes cannot happen there because the service-role key must stay on the server.

## 4. Check Supabase settings

1. Authentication: enable the sign-in provider you use for customers/riders.
2. Storage: confirm the `rider-documents` bucket exists. The schema creates it as private.
3. Realtime: confirm `deliveries`, `delivery_events`, `rider_locations`, and `notifications` are in the realtime publication.
4. Squad: set `SQUAD_SECRET_KEY`, set the matching sandbox/live `SQUAD_BASE_URL`, and add your live callback URLs in the Squad dashboard.
5. Admin: use `/admin`, log in with the admin credentials, then test rider approval, withdrawal review, site controls, and risk/support actions.
