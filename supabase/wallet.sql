-- ─────────────────────────────────────────────────────────────────────────────
-- Driver Wallet
-- Run this in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add wallet_balance to drivers table
alter table public.drivers
  add column if not exists wallet_balance numeric(12,2) not null default 0;

-- 2. Wallet transactions ledger
create table if not exists public.wallet_transactions (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.drivers(id) on delete cascade,
  type        text not null check (type in ('credit', 'debit', 'withdrawal', 'commission')),
  amount      numeric(12,2) not null,  -- always positive; type determines direction
  balance_after numeric(12,2) not null,
  description text,
  ride_id     uuid references public.rides(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_wallet_tx_driver on public.wallet_transactions(driver_id, created_at desc);

-- 3. RLS
alter table public.wallet_transactions enable row level security;

create policy "driver_can_read_own_wallet"
  on public.wallet_transactions for select
  using (
    driver_id in (
      select id from public.drivers where user_id = auth.uid()
    )
  );

create policy "admin_full_access_wallet"
  on public.wallet_transactions for all
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Realtime for wallet balance updates
alter publication supabase_realtime add table public.wallet_transactions;
