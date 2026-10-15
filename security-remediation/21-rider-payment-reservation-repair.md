# Rider payment reservation acceptance repair

Run these read-only checks in Supabase SQL Editor first. They neither create
orders nor modify production data.

```sql
select to_regprocedure('public.accept_or_queue_delivery_offer(uuid)') as active_accept_function,
       to_regprocedure('public.accept_or_queue_paid_delivery_offer(uuid)') as paid_accept_function,
       to_regprocedure('public.expire_delivery_payment_reservations()') as expiry_function;

select exists (
  select 1 from information_schema.tables
  where table_schema='public' and table_name='delivery_payment_reservations'
) as reservations_table_exists;

select enumlabel
from pg_enum
join pg_type on pg_type.oid=pg_enum.enumtypid
join pg_namespace on pg_namespace.oid=pg_type.typnamespace
where pg_namespace.nspname='public' and pg_type.typname='delivery_status'
order by enumsortorder;
```

If `paid_accept_function`, `reservations_table_exists`, or
`awaiting_customer_payment` is missing, apply
`202610150003_repair_rider_payment_reservation_acceptance.sql` once.

Then verify without changing data:

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema='public'
  and routine_name in ('accept_or_queue_delivery_offer', 'accept_or_queue_paid_delivery_offer')
order by routine_name, grantee;

select status, count(*)
from public.delivery_payment_reservations
group by status
order by status;
```

Do not call the acceptance RPC from SQL Editor as an administrator: it relies
on the authenticated rider identity and should be exercised only through the
Rider app.
