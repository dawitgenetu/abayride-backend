-- Migration: Add commission and distance columns to rides table
-- Run this in Supabase SQL editor

alter table public.rides
  add column if not exists distance_km    numeric(10,4) not null default 0,
  add column if not exists dev_fee        numeric(10,2) not null default 0,
  add column if not exists driver_earning numeric(10,2) not null default 0,
  add column if not exists payment_method text not null default 'cash'
    check (payment_method in ('cash', 'chapa'));

-- Back-fill existing rows: derive dev_fee and driver_earning from fare
update public.rides
set
  dev_fee        = round(fare * 0.10, 2),
  driver_earning = round(fare * 0.90, 2)
where dev_fee = 0 and fare > 0;
