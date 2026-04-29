-- Fix: allow a newly signed-up user to insert their own profile row.
-- The users table had SELECT and UPDATE policies but no INSERT policy,
-- causing "new row violates row-level security policy for table users".

create policy "users_can_insert_own_profile"
on public.users for insert
with check (auth.uid() = id);

-- Same fix for drivers table (driver profile insert on sign-up)
create policy "driver_can_insert_own_driver_profile"
on public.drivers for insert
with check (auth.uid() = user_id);
