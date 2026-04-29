-- Run this ONCE in Supabase SQL Editor if you already applied the old admin policies
-- that subquery public.users (causes: infinite recursion detected in policy for relation-users).

drop policy if exists "admin_full_access_users" on public.users;
drop policy if exists "admin_full_access_drivers" on public.drivers;
drop policy if exists "admin_full_access_rides" on public.rides;
drop policy if exists "admin_full_access_payments" on public.payments;
drop policy if exists "admin_full_access_ratings" on public.ratings;

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
