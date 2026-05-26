-- Phase 2–3: Smart Flexible Tables (dining zones)
create table if not exists public.dining_zones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null,
  slug text not null,
  max_concurrent_parties integer not null default 4 check (max_concurrent_parties >= 1),
  min_party_size integer not null default 1 check (min_party_size >= 1),
  max_party_size integer not null default 12 check (max_party_size >= 1),
  turnover_minutes integer not null default 90 check (turnover_minutes >= 15),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

create index if not exists dining_zones_business_id_idx on public.dining_zones (business_id, sort_order);

alter table public.appointments
  add column if not exists party_size integer,
  add column if not exists zone_id uuid references public.dining_zones (id) on delete set null;

create index if not exists appointments_zone_id_idx on public.appointments (zone_id);

comment on table public.dining_zones is 'Capacity buckets (Patio, Bar, etc.) — not a floor plan';
comment on column public.appointments.party_size is 'Guest count; also encoded in service_name for legacy rows';
comment on column public.appointments.zone_id is 'Preferred dining zone; null = any zone at booking time';
