create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text unique not null,
  role text not null check (role in ('rider', 'driver', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.users
  add column if not exists is_blocked boolean not null default false;

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  car_info text not null,
  license_number text not null unique,
  is_approved boolean not null default false,
  is_online boolean not null default false,
  last_location jsonb,
  created_at timestamptz not null default now()
);

alter table public.drivers add column if not exists total_earnings numeric(12,2) not null default 0;

alter table public.drivers add column if not exists approval_status text not null default 'pending';
alter table public.drivers add column if not exists rejection_reason text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drivers_approval_status_check'
  ) then
    alter table public.drivers
      add constraint drivers_approval_status_check
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

update public.drivers set approval_status = 'approved' where is_approved = true and approval_status = 'pending';

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.users(id) on delete cascade,
  driver_id uuid references public.users(id) on delete set null,
  pickup_location jsonb not null,
  destination_location jsonb not null,
  status text not null check (status in ('requested', 'accepted', 'arrived', 'picked_up', 'ongoing', 'completed', 'cancelled')) default 'requested',
  fare numeric(10,2) not null,
  payment_status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  amount numeric(10,2) not null,
  method text not null check (method in ('cash', 'chapa')),
  status text not null check (status in ('pending', 'completed', 'failed')) default 'pending',
  tx_ref text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.users(id) on delete cascade,
  driver_id uuid not null references public.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rides_status on public.rides(status);
create index if not exists idx_rides_rider_id on public.rides(rider_id);
create index if not exists idx_rides_driver_id on public.rides(driver_id);
create index if not exists idx_payments_ride_id on public.payments(ride_id);

alter publication supabase_realtime add table public.rides;
alter publication supabase_realtime add table public.drivers;
