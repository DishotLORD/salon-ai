-- OceanCore restaurant concierge — inferred from application code.
-- Apply in Supabase SQL editor or via `supabase db push` when CLI is linked.

create extension if not exists "pgcrypto";

-- ─── Businesses (restaurant tenants) ─────────────────────────────────────────
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  business_type text not null default 'restaurant',
  agent_name text,
  system_prompt text,
  language text default 'en',
  menu_pdf_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists businesses_user_id_idx on public.businesses (user_id);

-- ─── Menu items (table: services — legacy name) ──────────────────────────────
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  price numeric(10, 2),
  description text,
  category text,
  duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_business_id_idx on public.services (business_id);

-- ─── Guests ──────────────────────────────────────────────────────────────────
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null default 'Guest',
  email text default '',
  phone text default '',
  tags jsonb default '[]'::jsonb,
  preferred_staff text,
  total_bookings integer default 0,
  total_spent numeric(12, 2) default 0,
  visit_history jsonb default '[]'::jsonb,
  last_visit timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_business_id_idx on public.customers (business_id);

-- ─── Chat threads ──────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text,
  status text not null default 'active',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists conversations_business_id_idx on public.conversations (business_id);
create index if not exists conversations_updated_at_idx on public.conversations (business_id, updated_at desc);

-- ─── Messages ────────────────────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id, created_at);

-- ─── Reservations (table: appointments — legacy name) ────────────────────────
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  service_name text,
  scheduled_at timestamptz not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_business_id_idx on public.appointments (business_id, scheduled_at);
create index if not exists appointments_conversation_id_idx on public.appointments (conversation_id);

-- Enable Realtime in Supabase dashboard if needed:
-- alter publication supabase_realtime add table public.messages;
-- alter publication supabase_realtime add table public.conversations;
-- alter publication supabase_realtime add table public.customers;
