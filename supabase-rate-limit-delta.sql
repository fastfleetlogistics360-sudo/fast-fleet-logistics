-- Fast Fleets 360: F-008 server-enforced write paths.
-- Run this forward-only delta before deploying the F-008 code.
-- It keeps client reads that power the dashboards, but removes direct browser
-- writes from the flows now protected by the application rate limiter.

begin;

drop policy if exists "Riders manage own location and admins manage all" on public.rider_locations;
create policy "Riders read own location and admins read all"
  on public.rider_locations for select
  using (
    public.current_user_role() = 'admin'
    or exists (select 1 from public.rider_profiles rp where rp.id = rider_profile_id and rp.user_id = auth.uid())
  );

drop policy if exists "Users manage own latest location and admins manage all" on public.user_locations;
create policy "Users read own latest location and admins read all"
  on public.user_locations for select
  using (public.current_user_role() = 'admin' or user_id = auth.uid());

drop policy if exists "Assigned riders write delivery live location" on public.delivery_locations;
drop policy if exists "Assigned riders update delivery live location" on public.delivery_locations;

drop policy if exists "Users manage own saved addresses" on public.saved_addresses;
create policy "Users read own saved addresses and admins read all"
  on public.saved_addresses for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Users join own state waitlist and admins manage all" on public.state_waitlist;
create policy "Users read own state waitlist and admins read all"
  on public.state_waitlist for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Users manage own notifications" on public.notifications;
create policy "Users read own notifications and admins read all"
  on public.notifications for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users read own push subscriptions and admins read all"
  on public.push_subscriptions for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Support ticket owner and admin access" on public.support_tickets;
drop policy if exists "Anyone can create support tickets" on public.support_tickets;
create policy "Support ticket owners and admins read"
  on public.support_tickets for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "Anyone can create support messages" on public.support_messages;

commit;
