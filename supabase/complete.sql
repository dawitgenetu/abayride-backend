-- ============================================================
-- TANA MARKET — Complete Supabase SQL (run once, fresh DB)
-- ============================================================

-- ─── EXTENSIONS ─────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── TABLES ─────────────────────────────────────────────────

create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  phone      text unique not null,
  role       text not null check (role in ('rider', 'driver', 'admin')),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references public.users(id) on delete cascade,
  car_info         text not null,
  license_number   text not null unique,
  is_approved      boolean not null default false,
  is_online        boolean not null default false,
  last_location    jsonb,
  total_earnings   numeric(12,2) not null default 0,
  approval_status  text not null default 'pending'
                     check (approval_status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at       timestamptz not null default now()
);

create table if not exists public.rides (
  id                   uuid primary key default gen_random_uuid(),
  rider_id             uuid not null references public.users(id) on delete cascade,
  driver_id            uuid references public.users(id) on delete set null,
  pickup_location      jsonb not null,
  destination_location jsonb not null,
  status               text not null default 'requested'
                         check (status in ('requested','accepted','arrived','picked_up','ongoing','completed','cancelled')),
  fare                 numeric(10,2) not null,
  payment_status       text not null default 'unpaid',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides(id) on delete cascade,
  amount     numeric(10,2) not null,
  method     text not null check (method in ('cash', 'chapa')),
  status     text not null default 'pending'
               check (status in ('pending', 'completed', 'failed')),
  tx_ref     text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id         uuid primary key default gen_random_uuid(),
  rider_id   uuid not null references public.users(id) on delete cascade,
  driver_id  uuid not null references public.users(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);

-- ─── INDEXES ────────────────────────────────────────────────

create index if not exists idx_rides_status    on public.rides(status);
create index if not exists idx_rides_rider_id  on public.rides(rider_id);
create index if not exists idx_rides_driver_id on public.rides(driver_id);
create index if not exists idx_payments_ride_id on public.payments(ride_id);

-- Only one admin allowed
create unique index if not exists unique_single_admin_role
  on public.users ((role)) where role = 'admin';

-- ─── REALTIME ───────────────────────────────────────────────

alter publication supabase_realtime add table public.rides;
alter publication supabase_realtime add table public.drivers;

-- ─── RLS: ENABLE ────────────────────────────────────────────

alter table public.users    enable row level security;
alter table public.drivers  enable row level security;
alter table public.rides    enable row level security;
alter table public.payments enable row level security;
alter table public.ratings  enable row level security;

-- ─── ADMIN HELPER FUNCTION ──────────────────────────────────
-- security definer so it bypasses RLS when checking role,
-- avoiding infinite recursion inside users policies.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

-- ─── RLS POLICIES: USERS ────────────────────────────────────

drop policy if exists "users_can_insert_own_profile"  on public.users;
drop policy if exists "users_can_read_own_profile"    on public.users;
drop policy if exists "users_can_update_own_profile"  on public.users;
drop policy if exists "admin_full_access_users"       on public.users;

create policy "users_can_insert_own_profile"
  on public.users for insert
  with check (auth.uid() = id);

create policy "users_can_read_own_profile"
  on public.users for select
  using (auth.uid() = id);

create policy "users_can_update_own_profile"
  on public.users for update
  using (auth.uid() = id);

create policy "admin_full_access_users"
  on public.users for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── RLS POLICIES: DRIVERS ──────────────────────────────────

drop policy if exists "driver_can_insert_own_driver_profile" on public.drivers;
drop policy if exists "driver_can_read_own_driver_profile"   on public.drivers;
drop policy if exists "driver_can_update_own_status"         on public.drivers;
drop policy if exists "admin_full_access_drivers"            on public.drivers;

create policy "driver_can_insert_own_driver_profile"
  on public.drivers for insert
  with check (auth.uid() = user_id);

create policy "driver_can_read_own_driver_profile"
  on public.drivers for select
  using (auth.uid() = user_id);

create policy "driver_can_update_own_status"
  on public.drivers for update
  using (auth.uid() = user_id);

create policy "admin_full_access_drivers"
  on public.drivers for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── RLS POLICIES: RIDES ────────────────────────────────────

drop policy if exists "rider_can_create_own_ride"          on public.rides;
drop policy if exists "rider_driver_can_view_related_rides" on public.rides;
drop policy if exists "driver_can_update_assigned_ride"    on public.rides;
drop policy if exists "admin_full_access_rides"            on public.rides;

create policy "rider_can_create_own_ride"
  on public.rides for insert
  with check (auth.uid() = rider_id);

create policy "rider_driver_can_view_related_rides"
  on public.rides for select
  using (auth.uid() = rider_id or auth.uid() = driver_id);

create policy "driver_can_update_assigned_ride"
  on public.rides for update
  using (auth.uid() = driver_id);

create policy "admin_full_access_rides"
  on public.rides for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── RLS POLICIES: PAYMENTS ─────────────────────────────────

drop policy if exists "users_can_view_ride_payments" on public.payments;
drop policy if exists "admin_full_access_payments"   on public.payments;

create policy "users_can_view_ride_payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.rides r
      where r.id = payments.ride_id
        and (r.rider_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

create policy "admin_full_access_payments"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── RLS POLICIES: RATINGS ──────────────────────────────────

drop policy if exists "rider_can_create_rating"        on public.ratings;
drop policy if exists "related_users_can_view_ratings" on public.ratings;
drop policy if exists "admin_full_access_ratings"      on public.ratings;

create policy "rider_can_create_rating"
  on public.ratings for insert
  with check (auth.uid() = rider_id);

create policy "related_users_can_view_ratings"
  on public.ratings for select
  using (auth.uid() = rider_id or auth.uid() = driver_id);

create policy "admin_full_access_ratings"
  on public.ratings for all
  using (public.is_admin())
  with check (public.is_admin());
