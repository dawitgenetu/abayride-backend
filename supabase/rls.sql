alter table public.users enable row level security;
alter table public.drivers enable row level security;
alter table public.rides enable row level security;
alter table public.payments enable row level security;
alter table public.ratings enable row level security;

-- users
create policy "users_can_read_own_profile"
on public.users for select
using (auth.uid() = id);

create policy "users_can_update_own_profile"
on public.users for update
using (auth.uid() = id);

-- drivers
create policy "driver_can_read_own_driver_profile"
on public.drivers for select
using (auth.uid() = user_id);

create policy "driver_can_update_own_status"
on public.drivers for update
using (auth.uid() = user_id);

-- rides
create policy "rider_can_create_own_ride"
on public.rides for insert
with check (auth.uid() = rider_id);

create policy "rider_driver_can_view_related_rides"
on public.rides for select
using (auth.uid() = rider_id or auth.uid() = driver_id);

create policy "driver_can_update_assigned_ride"
on public.rides for update
using (auth.uid() = driver_id);

-- payments
create policy "users_can_view_ride_payments"
on public.payments for select
using (
  exists (
    select 1
    from public.rides r
    where r.id = payments.ride_id
      and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
  )
);

-- ratings
create policy "rider_can_create_rating"
on public.ratings for insert
with check (auth.uid() = rider_id);

create policy "related_users_can_view_ratings"
on public.ratings for select
using (auth.uid() = rider_id or auth.uid() = driver_id);

-- Admin checks must NOT subquery public.users inside users policies (infinite RLS recursion).
-- This helper runs with definer rights so it can read role without re-entering users RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

-- admin read/write access
create policy "admin_full_access_users"
on public.users for all
using (public.is_admin())
with check (public.is_admin());

create policy "admin_full_access_drivers"
on public.drivers for all
using (public.is_admin())
with check (public.is_admin());

create policy "admin_full_access_rides"
on public.rides for all
using (public.is_admin())
with check (public.is_admin());

create policy "admin_full_access_payments"
on public.payments for all
using (public.is_admin())
with check (public.is_admin());

create policy "admin_full_access_ratings"
on public.ratings for all
using (public.is_admin())
with check (public.is_admin());
