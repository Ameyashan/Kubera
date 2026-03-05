-- =============================================
-- AI-Powered Personal CFO — Supabase Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. Transactions table
create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  date text not null,
  description text not null,
  amount numeric(12,2) not null,
  card text default 'Unknown',
  category text default 'Other',
  account_type text not null default 'credit_card',
  source_file text,
  created_at timestamptz default now()
);

-- Migration: add account_type to existing tables
-- Run this if the table already exists:
-- alter table public.transactions add column if not exists account_type text not null default 'credit_card';

-- 2. Dashboard cache (pre-computed aggregates)
create table if not exists public.dashboard_cache (
  user_id uuid references auth.users(id) on delete cascade primary key,
  payload jsonb not null,
  generated_at timestamptz default now()
);

-- 3. Enable Row Level Security
alter table public.transactions enable row level security;
alter table public.dashboard_cache enable row level security;

-- 4. RLS Policies — each user only sees their own data
create policy "Users manage own transactions"
  on public.transactions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own dashboard cache"
  on public.dashboard_cache for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Index for faster queries
create index if not exists idx_transactions_user_date 
  on public.transactions(user_id, date);

create index if not exists idx_transactions_user_category 
  on public.transactions(user_id, category);

create index if not exists idx_transactions_user_account_type
  on public.transactions(user_id, account_type);
