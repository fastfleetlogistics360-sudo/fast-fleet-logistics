-- Supabase Cron replaces the unsupported every-minute Vercel Hobby cron.
-- This migration deliberately does not alter reservation, settlement, payment,
-- rider-matching, or timeout logic. It only schedules the existing protected
-- cleanup routine.
begin;

-- In Supabase this can also be enabled in Dashboard > Integrations > Cron.
-- The statement is idempotent and fails safely if the project administrator
-- has not made pg_cron available for this database.
create extension if not exists pg_cron;

-- pg_cron runs jobs as the role that creates them, rather than through a
-- PostgREST service-role request. Keep the public expiry routine service-only,
-- and bridge only the trusted scheduler invocation. session_user remains the
-- actual scheduling role even inside this SECURITY DEFINER function.
create or replace function public.run_delivery_payment_reservation_expiry_cron()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Reservation expiry scheduler may only run as a database owner'
      using errcode = '42501';
  end if;

  -- auth.role() in the existing service-only routine reads this server-side
  -- transaction setting. It is not derived from a browser request or exposed
  -- through PostgREST because no client role receives EXECUTE on this wrapper.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return public.expire_delivery_payment_reservations();
end;
$$;

revoke all on function public.run_delivery_payment_reservation_expiry_cron()
  from public, anon, authenticated, service_role;

-- Remove only this named job before scheduling it again. This makes a retry or
-- a forward correction idempotent while leaving unrelated cron jobs untouched.
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'fastfleet-expire-delivery-payment-reservations';
end;
$$;

select cron.schedule(
  'fastfleet-expire-delivery-payment-reservations',
  '* * * * *',
  $command$select public.run_delivery_payment_reservation_expiry_cron();$command$
);

commit;
