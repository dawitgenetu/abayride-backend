-- ─────────────────────────────────────────────────────────────────────────────
-- Ride Expiry Migration
-- Adds accepted_at timestamp and 'expired' status to the rides table.
-- Run this in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add accepted_at column (nullable — only set when a driver accepts)
alter table public.rides
  add column if not exists accepted_at timestamptz default null;

-- 2. Extend the status check constraint to include 'expired'
--    Drop the old constraint first (name may vary — check yours with \d rides)
alter table public.rides
  drop constraint if exists rides_status_check;

alter table public.rides
  add constraint rides_status_check
  check (status in (
    'requested',
    'accepted',
    'arrived',
    'picked_up',
    'ongoing',
    'completed',
    'cancelled',
    'expired'
  ));

-- 3. Back-fill accepted_at for existing accepted/arrived/ongoing/completed rows
--    Use updated_at as a best-effort approximation
update public.rides
set accepted_at = updated_at
where accepted_at is null
  and status in ('accepted', 'arrived', 'picked_up', 'ongoing', 'completed');

-- 4. Index for the expiry query (status + accepted_at)
create index if not exists idx_rides_expiry
  on public.rides (status, accepted_at)
  where status in ('accepted', 'arrived');
