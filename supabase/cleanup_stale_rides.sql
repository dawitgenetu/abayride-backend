-- ============================================================
-- Scheduled cleanup: delete stale ride requests from past days
-- Run this in Supabase SQL editor to set up pg_cron job
-- ============================================================

-- Enable pg_cron extension (run once, requires superuser)
create extension if not exists pg_cron;

-- Schedule: runs every day at 00:05 UTC
-- Deletes only safe statuses — never touches active/completed rides
select cron.schedule(
  'cleanup-stale-rides',          -- job name (unique)
  '5 0 * * *',                    -- cron: 00:05 UTC daily
  $$
    delete from public.rides
    where
      created_at < current_date   -- strictly before today (UTC)
      and status in ('requested', 'cancelled');
  $$
);

-- ── To verify the job was created ──────────────────────────
-- select * from cron.job;

-- ── To remove the job if needed ────────────────────────────
-- select cron.unschedule('cleanup-stale-rides');

-- ── To run manually right now ──────────────────────────────
-- delete from public.rides
-- where created_at < current_date
-- and status in ('requested', 'cancelled');
