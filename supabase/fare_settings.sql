-- ─────────────────────────────────────────────────────────────
-- Fare Settings table
-- Single-row config table for dynamic fare values.
-- Run this in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.fare_settings (
  id              int primary key default 1,          -- always row 1
  price_per_km    numeric(10,2) not null default 100, -- ETB per km
  standby_fee     numeric(10,2) not null default 100, -- ETB flat standby
  updated_at      timestamptz not null default now(),

  -- enforce single row
  constraint fare_settings_single_row check (id = 1)
);

-- Seed the default row (idempotent)
insert into public.fare_settings (id, price_per_km, standby_fee)
values (1, 100, 100)
on conflict (id) do nothing;

-- RLS: anyone authenticated can read; only service-role (backend) can write
alter table public.fare_settings enable row level security;

create policy "fare_settings_read"
  on public.fare_settings for select
  using (true);

-- No direct client writes — all mutations go through the backend service role
