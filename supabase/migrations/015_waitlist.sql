-- Waitlist: when a requested slot is full, the AI offers to add the guest to a
-- queue instead of turning them away. Staff work the list from the dashboard.

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  guest_name text not null default 'Guest',
  phone text,
  email text,
  requested_date date not null,
  requested_time text not null, -- HH:MM Calgary wall clock
  party_size integer not null default 2 check (party_size >= 1),
  zone_id uuid references public.dining_zones (id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting', 'contacted', 'converted', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists waitlist_business_date_idx
  on public.waitlist_entries (business_id, requested_date, status);

comment on table public.waitlist_entries is
  'Guests queued for full slots; staff convert entries into reservations when space opens';

alter table public.waitlist_entries enable row level security;

drop policy if exists "waitlist_members_all" on public.waitlist_entries;
create policy "waitlist_members_all" on public.waitlist_entries
  for all to authenticated
  using (business_id in (select public.accessible_business_ids()))
  with check (business_id in (select public.accessible_business_ids()));
