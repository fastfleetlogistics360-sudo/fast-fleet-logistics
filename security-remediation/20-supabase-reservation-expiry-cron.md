# Supabase reservation-expiry scheduler

This document is for the database administrator applying
`202610150001_supabase_reservation_expiry_cron.sql`. It replaces only the
every-minute Vercel invocation; the remaining Vercel cron entries are unchanged.

## What is scheduled

The scheduler calls `public.run_delivery_payment_reservation_expiry_cron()` once
per minute. The wrapper is executable only by its database owner and supplies
the server-side role context required by the existing protected function:

```sql
public.expire_delivery_payment_reservations() returns integer
```

The existing function retains the five-minute configurable timeout and its
payment-versus-expiry locks. It skips rows that have a settled payment, marks
only still-reserved records as expired, and uses `FOR UPDATE SKIP LOCKED`, so
overlapping minute runs are safe and idempotent.

## Enable in Supabase

1. Open the intended Supabase project (use staging first).
2. In **Integrations → Cron**, enable the `pg_cron` module if it is not already
   enabled. The migration also uses `create extension if not exists pg_cron`.
3. Apply migrations through `202610150001_supabase_reservation_expiry_cron.sql`
   as the database owner (`postgres` in a standard Supabase SQL Editor).
4. Run the read-only checks below. Confirm the job owner is `postgres` or
   `supabase_admin`, matching the wrapper allow-list.
5. Monitor `cron.job_run_details` after the first few minute runs.

Do not run the migration in a project until its prior checkout migrations and
the protected expiry function are present. The migration is intentionally not
applied by application code.

## Read-only preflight and verification queries

```sql
-- Supabase Cron availability in this exact database.
select extname, extversion
from pg_extension
where extname = 'pg_cron';

select name, installed_version, default_version
from pg_available_extensions
where name = 'pg_cron';

-- Inspect the protected function actually present before scheduling it.
select p.oid::regprocedure as signature,
       p.prosecdef as security_definer,
       p.proacl as execute_acl
from pg_proc p
where p.oid = 'public.expire_delivery_payment_reservations()'::regprocedure;

-- Confirm the expected protected function dependencies exist.
select to_regclass('public.deliveries') as deliveries,
       to_regclass('public.delivery_payment_reservations') as reservations,
       to_regclass('public.payment_intents') as payment_intents,
       to_regclass('public.fleet_assets') as fleet_assets;

-- Confirm there is exactly one active, correctly owned job after migration.
select jobid, jobname, schedule, username, active, command
from cron.job
where jobname = 'fastfleet-expire-delivery-payment-reservations';

-- Non-mutating view of reservations that the next run could expire.
select count(*) as expiry_candidates
from public.delivery_payment_reservations r
join public.deliveries d on d.id = r.delivery_id
where r.status = 'reserved'
  and r.expires_at <= now()
  and d.status in ('awaiting_customer_payment', 'searching')
  and coalesce(d.metadata ->> 'rider_payment_reservation', 'false') = 'true'
  and not exists (
    select 1
    from public.payment_intents pi
    where pi.delivery_id = d.id and pi.status = 'settled'
  );

-- Observe scheduler success/failure without executing cleanup manually.
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'fastfleet-expire-delivery-payment-reservations'
)
order by start_time desc
limit 20;
```

`pg_cron` availability and minute scheduling must be confirmed in the target
project with the first two queries. Supabase Cron supports SQL jobs and minute
cron schedules, but the project administrator must enable the module and the
database owner must be permitted to create jobs.
